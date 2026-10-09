begin;

-- A project is one client's service (or a generic project). No existing work is
-- reassigned by installation: defaults start absent until an explicit bulk save.
create table public.service_assignment_rules (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  primary key (organization_id, project_id),
  constraint service_assignment_rules_project_fkey foreign key (organization_id, project_id)
    references public.projects(organization_id, id) on delete cascade
);
create table public.service_assignment_members (
  organization_id uuid not null,
  project_id uuid not null,
  user_id uuid not null,
  primary key (organization_id, project_id, user_id),
  constraint service_assignment_members_rule_fkey foreign key (organization_id, project_id)
    references public.service_assignment_rules(organization_id, project_id) on delete cascade,
  constraint service_assignment_members_member_fkey foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);
create index service_assignment_members_user_idx
  on public.service_assignment_members(organization_id, user_id);
alter table public.service_assignment_rules enable row level security;
alter table public.service_assignment_members enable row level security;
revoke all on public.service_assignment_rules, public.service_assignment_members from public, anon, authenticated;
grant select on public.service_assignment_rules, public.service_assignment_members to authenticated;
create policy service_rules_read on public.service_assignment_rules for select to authenticated
  using (private.is_member(organization_id));
create policy service_members_read on public.service_assignment_members for select to authenticated
  using (private.is_member(organization_id));

-- Only this private, caller-validated helper writes saved defaults. Empty rules
-- deliberately mean unassigned, so a missing rule differs from an empty rule.
create function private.save_service_assignment_defaults(
  p_organization_id uuid, p_project_ids uuid[], p_assignees uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare selected_projects uuid[]; selected_members uuid[]; selected_rules uuid[];
begin
  if auth.uid() is null or not private.has_role(p_organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can change service assignments' using errcode = '42501';
  end if;
  if p_project_ids is null or cardinality(p_project_ids) not between 1 and 1000
    or exists (select 1 from unnest(p_project_ids) u where u is null) then
    raise exception 'Choose between 1 and 1000 services or projects' using errcode = '22023';
  end if;
  if p_assignees is null or cardinality(p_assignees) > 100
    or exists (select 1 from unnest(p_assignees) u where u is null) then
    raise exception 'Choose up to 100 workspace members, or an empty list to unassign' using errcode = '22023';
  end if;
  selected_projects = array(select distinct u from unnest(p_project_ids) u order by u);
  selected_members = array(select distinct u from unnest(p_assignees) u order by u);
  perform p.id from public.projects p
    where p.organization_id = p_organization_id and p.id = any(selected_projects)
    order by p.id for update;
  if (select count(*) from public.projects p where p.organization_id = p_organization_id and p.id = any(selected_projects)) <> cardinality(selected_projects) then
    raise exception 'Every service or project must belong to this workspace' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(selected_members) u where not exists (
    select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = u
  )) then
    raise exception 'Choose members of this workspace' using errcode = '23503';
  end if;

  insert into public.service_assignment_rules(organization_id, project_id)
    select p_organization_id, u from unnest(selected_projects) u order by u on conflict do nothing;
  delete from public.service_assignment_members m
    where m.organization_id = p_organization_id and m.project_id = any(selected_projects);
  insert into public.service_assignment_members(organization_id, project_id, user_id)
    select p_organization_id, p, u from unnest(selected_projects) p cross join unnest(selected_members) u;

  -- Reset the selected services' known series. Later individual saves can create
  -- their own overrides again; deliverables first created later use the fallback.
  insert into public.recurring_assignment_rules(organization_id, project_id, deliverable_definition_id)
    select p.organization_id, p.id, d.id from public.projects p
    join public.service_deliverables d on d.organization_id = p.organization_id and d.service_template_id = p.service_template_id
    where p.organization_id = p_organization_id and p.id = any(selected_projects)
    order by p.id, d.id
    on conflict(project_id, deliverable_definition_id) where source_task_id is null do nothing;
  insert into public.recurring_assignment_rules(organization_id, source_task_id)
    select t.organization_id, t.id from public.tasks t
    where t.organization_id = p_organization_id and t.project_id = any(selected_projects)
      and t.recurrence_type <> 'none' and t.recurrence_parent_id is null
    order by t.id on conflict(source_task_id) where source_task_id is not null do nothing;
  selected_rules = array(
    select r.id from public.recurring_assignment_rules r
    left join public.tasks root on root.organization_id = r.organization_id and root.id = r.source_task_id
    where r.organization_id = p_organization_id
      and (r.project_id = any(selected_projects) or root.project_id = any(selected_projects))
    order by r.id for update of r
  );
  delete from public.recurring_assignment_members m
    where m.organization_id = p_organization_id and m.rule_id = any(selected_rules);
  insert into public.recurring_assignment_members(organization_id, rule_id, user_id)
    select p_organization_id, r, u from unnest(selected_rules) r cross join unnest(selected_members) u;
end $$;
revoke all on function private.save_service_assignment_defaults(uuid, uuid[], uuid[]) from public, anon;
grant execute on function private.save_service_assignment_defaults(uuid, uuid[], uuid[]) to authenticated;

create function public.set_service_assignees(
  p_organization_id uuid, p_project_ids uuid[], p_assignees uuid[], p_apply_to_future boolean
) returns integer language plpgsql security invoker set search_path = '' as $$
declare selected_projects uuid[]; selected_members uuid[]; selected_tasks uuid[];
  today date = (now() at time zone 'Africa/Johannesburg')::date;
begin
  if auth.uid() is null or not private.has_role(p_organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can change service assignments' using errcode = '42501';
  end if;
  if p_project_ids is null or cardinality(p_project_ids) not between 1 and 1000
    or exists (select 1 from unnest(p_project_ids) u where u is null) then
    raise exception 'Choose between 1 and 1000 services or projects' using errcode = '22023';
  end if;
  if p_assignees is null or cardinality(p_assignees) > 100
    or exists (select 1 from unnest(p_assignees) u where u is null) or p_apply_to_future is null then
    raise exception 'Choose up to 100 workspace members and an assignment scope' using errcode = '22023';
  end if;
  selected_projects = array(select distinct u from unnest(p_project_ids) u order by u);
  selected_members = array(select distinct u from unnest(p_assignees) u order by u);
  -- All validation precedes mutations; project locks also serialize generation
  -- through the tasks' project foreign key. Task locks follow deterministic order.
  perform p.id from public.projects p
    where p.organization_id = p_organization_id and p.id = any(selected_projects)
    order by p.id for update;
  if (select count(*) from public.projects p where p.organization_id = p_organization_id and p.id = any(selected_projects)) <> cardinality(selected_projects) then
    raise exception 'Every service or project must belong to this workspace' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(selected_members) u where not exists (
    select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = u
  )) then
    raise exception 'Choose members of this workspace' using errcode = '23503';
  end if;
  selected_tasks = array(
    select t.id from public.tasks t
    where t.organization_id = p_organization_id and t.project_id = any(selected_projects)
      and t.status not in ('done', 'cancelled') and (t.period_end is null or t.period_end >= today)
    order by t.id for update
  );
  delete from public.task_assignees a
    where a.organization_id = p_organization_id and a.task_id = any(selected_tasks)
      and not (a.user_id = any(selected_members));
  insert into public.task_assignees(organization_id, task_id, user_id)
    select p_organization_id, t, u from unnest(selected_tasks) t cross join unnest(selected_members) u
    on conflict(task_id, user_id) do nothing;
  if p_apply_to_future then
    perform private.save_service_assignment_defaults(p_organization_id, selected_projects, selected_members);
  end if;
  return cardinality(selected_tasks);
end $$;
revoke all on function public.set_service_assignees(uuid, uuid[], uuid[], boolean) from public, anon;
grant execute on function public.set_service_assignees(uuid, uuid[], uuid[], boolean) to authenticated;

-- Exact counts for the bulk picker do not depend on the Tasks page's pagination.
create function public.service_assignment_options(p_organization_id uuid)
returns table(project_id uuid, eligible_tasks bigint, default_configured boolean, default_assignees uuid[])
language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(p_organization_id) then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  return query
    select p.id,
      (select count(*) from public.tasks t where t.organization_id = p.organization_id and t.project_id = p.id
        and t.status not in ('done', 'cancelled')
        and (t.period_end is null or t.period_end >= (now() at time zone 'Africa/Johannesburg')::date)),
      r.project_id is not null,
      array(select m.user_id from public.service_assignment_members m
        where m.organization_id = p.organization_id and m.project_id = p.id order by m.user_id)
    from public.projects p left join public.service_assignment_rules r
      on r.organization_id = p.organization_id and r.project_id = p.id
    where p.organization_id = p_organization_id order by p.id;
end $$;
revoke all on function public.service_assignment_options(uuid) from public, anon;
grant execute on function public.service_assignment_options(uuid) to authenticated;

-- Series overrides (including explicit empty rules) win. A project's fallback
-- covers unseen deliverables; manual legacy roots are the final fallback.
create or replace function private.inherit_recurring_assignments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rule uuid; service_project uuid;
begin
  if new.deliverable_definition_id is null and new.recurrence_parent_id is null and new.recurrence_type = 'none' then return new; end if;
  if auth.uid() is not null and not private.has_role(new.organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can generate assigned tasks' using errcode = '42501';
  end if;
  if new.deliverable_definition_id is not null then
    select r.id into rule from public.recurring_assignment_rules r
      where r.organization_id = new.organization_id and r.project_id = new.project_id
        and r.deliverable_definition_id = new.deliverable_definition_id for share;
  elsif new.recurrence_parent_id is not null then
    select r.id into rule from public.recurring_assignment_rules r
      where r.organization_id = new.organization_id and r.source_task_id = new.recurrence_parent_id for share;
  end if;
  if rule is not null then
    insert into public.task_assignees(organization_id, task_id, user_id)
      select new.organization_id, new.id, m.user_id from public.recurring_assignment_members m
      where m.organization_id = new.organization_id and m.rule_id = rule on conflict(task_id, user_id) do nothing;
    return new;
  end if;
  select r.project_id into service_project from public.service_assignment_rules r
    where r.organization_id = new.organization_id and r.project_id = new.project_id for share;
  if service_project is not null then
    insert into public.task_assignees(organization_id, task_id, user_id)
      select new.organization_id, new.id, m.user_id from public.service_assignment_members m
      where m.organization_id = new.organization_id and m.project_id = service_project on conflict(task_id, user_id) do nothing;
  elsif new.recurrence_parent_id is not null then
    insert into public.task_assignees(organization_id, task_id, user_id)
      select new.organization_id, new.id, a.user_id from public.task_assignees a
      where a.organization_id = new.organization_id and a.task_id = new.recurrence_parent_id on conflict(task_id, user_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.inherit_recurring_assignments() from public;

-- The normal task form sends an empty assignee list for a new manual series.
-- With a project default, that initial blank selection inherits the saved team.
-- Explicit people or explicit future-unassignment remain individual overrides.
create or replace function public.save_task(
  p_organization_id uuid, p_id uuid, p_title text, p_description text,
  p_status public.task_status, p_priority public.task_priority, p_due_date date,
  p_project_id uuid, p_client_id uuid, p_assignees uuid[],
  p_recurrence_type text default 'none', p_recurrence_start date default null,
  p_recurrence_end date default null, p_apply_to_future boolean default false
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result uuid; resolved_assignees uuid[] = p_assignees;
begin
  if auth.uid() is null or not private.is_member(p_organization_id) then
    raise exception 'Workspace access required' using errcode = '42501';
  end if;
  if cardinality(p_assignees) > 100 then raise exception 'Too many assignees' using errcode = '22023'; end if;
  if p_id is null then
    insert into public.tasks(organization_id, title, description, status, priority, due_date,
      project_id, client_id, created_by, recurrence_type, recurrence_start, recurrence_end)
    values(p_organization_id, p_title, p_description, p_status, p_priority, p_due_date,
      p_project_id, p_client_id, auth.uid(), p_recurrence_type, p_recurrence_start, p_recurrence_end)
    returning id into result;
    if p_recurrence_type <> 'none' and p_apply_to_future = false
      and cardinality(coalesce(p_assignees, '{}'::uuid[])) = 0
      and exists(select 1 from public.service_assignment_rules r
        where r.organization_id = p_organization_id and r.project_id = p_project_id) then
      resolved_assignees = array(select a.user_id from public.task_assignees a
        where a.organization_id = p_organization_id and a.task_id = result order by a.user_id);
    end if;
  else
    update public.tasks set title = p_title, description = p_description, status = p_status,
      priority = p_priority, due_date = p_due_date, project_id = p_project_id, client_id = p_client_id,
      recurrence_type = p_recurrence_type, recurrence_start = p_recurrence_start, recurrence_end = p_recurrence_end
    where id = p_id and organization_id = p_organization_id returning id into result;
    if result is null then raise exception 'Task not found' using errcode = '42501'; end if;
  end if;
  perform public.set_task_assignees(p_organization_id, result, resolved_assignees, p_apply_to_future);
  if p_recurrence_type <> 'none' then
    if not exists(select 1 from public.recurring_assignment_rules r
      where r.organization_id = p_organization_id and r.source_task_id = result) then
      perform private.save_recurring_assignments(p_organization_id, result, resolved_assignees);
    end if;
    perform public.generate_current_deliverables(p_organization_id);
  end if;
  return result;
end $$;
revoke all on function public.save_task(uuid, uuid, text, text, public.task_status, public.task_priority, date, uuid, uuid, uuid[], text, date, date, boolean) from public, anon;
grant execute on function public.save_task(uuid, uuid, text, text, public.task_status, public.task_priority, date, uuid, uuid, uuid[], text, date, date, boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
