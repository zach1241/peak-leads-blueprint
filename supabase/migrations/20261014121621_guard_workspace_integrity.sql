begin;

-- Content edits remain available on a member's own help requests. The separate
-- admin status action must also be enforced when the Data API is called directly.
create function private.guard_help_request_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null
    and not private.has_role(old.organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can change help request status' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_help_request_status() from public, anon, authenticated;
create trigger guard_help_request_status before update of status on public.help_requests
  for each row execute function private.guard_help_request_status();

-- Codes are package identity, independent of the editable display name. Keeping
-- them fixed also prevents a direct API code edit from bypassing the SEO guard.
create function private.guard_service_template_code()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.code is distinct from old.code then
    raise exception 'Service package codes are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_service_template_code() from public, anon, authenticated;
create trigger guard_service_template_code before update of code on public.service_templates
  for each row execute function private.guard_service_template_code();

-- A derived group supplies an atomic uniqueness constraint for every project
-- write without adding a client lock after an UPDATE has locked its project.
-- Every UPDATE recomputes it, so direct API clients cannot forge this field.
alter table public.projects add column exclusive_service_group text
  check (exclusive_service_group is null or exclusive_service_group = 'seo');
create function private.guard_exclusive_service_group()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare package_code text;
begin
  new.exclusive_service_group = null;
  if new.service_template_id is null then return new; end if;
  select s.code into package_code from public.service_templates s
    where s.organization_id = new.organization_id and s.id = new.service_template_id;
  if package_code in ('standard-seo','dominate-seo') then new.exclusive_service_group = 'seo'; end if;
  return new;
end $$;
revoke all on function private.guard_exclusive_service_group() from public, anon, authenticated;
create trigger guard_exclusive_service_group before insert or update on public.projects
  for each row execute function private.guard_exclusive_service_group();
-- Fill only the new derived field while retaining every existing timestamp and
-- audit entry. ALTER TABLE holds the table lock throughout this transaction.
alter table public.projects disable trigger log_change;
alter table public.projects disable trigger touch_updated_at;
update public.projects p set exclusive_service_group = 'seo'
  from public.service_templates s
  where s.organization_id = p.organization_id and s.id = p.service_template_id
    and s.code in ('standard-seo','dominate-seo');
alter table public.projects enable trigger log_change;
alter table public.projects enable trigger touch_updated_at;
create unique index one_active_seo_package
  on public.projects(organization_id, client_id, exclusive_service_group)
  where status = 'active' and exclusive_service_group is not null and client_id is not null;

-- Reconnecting finds the existing link before INSERT, avoiding a competing SEO
-- unique-index check on a fresh row for the same canonical client/service link.
-- The old signature, assignments, inactive status, and scoped generation remain.
create or replace function public.connect_client_service(
  p_organization_id uuid, p_client_id uuid, p_service_template_id uuid, p_assignees uuid[]
) returns table(project_id uuid, tasks_assigned integer, tasks_generated integer)
language plpgsql security invoker set search_path = '' as $$
declare service public.service_templates; linked_project uuid; existing_count integer; generated_count integer;
begin
  if auth.uid() is null or not private.has_role(p_organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can connect client services' using errcode = '42501';
  end if;
  if p_assignees is null or cardinality(p_assignees) > 100 or exists(select 1 from unnest(p_assignees) u where u is null) then
    raise exception 'Choose up to 100 workspace members, or an empty list to leave work unassigned' using errcode = '22023';
  end if;
  perform c.id from public.clients c
    where c.organization_id = p_organization_id and c.id = p_client_id for update;
  if not found then raise exception 'Client not found in this workspace' using errcode = '42501'; end if;
  select st.* into service from public.service_templates st
    where st.organization_id = p_organization_id and st.id = p_service_template_id for share;
  if not found then raise exception 'Service not found in this workspace' using errcode = '42501'; end if;
  if exists(select 1 from unnest(p_assignees) u where not exists(
    select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = u
  )) then raise exception 'Choose members of this workspace' using errcode = '23503'; end if;
  select p.id into linked_project from public.projects p
    where p.organization_id = p_organization_id and p.client_id = p_client_id
      and p.service_template_id = p_service_template_id for update;
  if linked_project is null then
    insert into public.projects(organization_id, client_id, service_template_id, name, status, created_by)
      values(p_organization_id, p_client_id, p_service_template_id, service.name, 'active', auth.uid())
      on conflict(organization_id, client_id, service_template_id) where service_template_id is not null do nothing
      returning id into linked_project;
    if linked_project is null then
      select p.id into linked_project from public.projects p
        where p.organization_id = p_organization_id and p.client_id = p_client_id
          and p.service_template_id = p_service_template_id for update;
    end if;
  end if;
  if linked_project is null then raise exception 'Client service link could not be found' using errcode = '42501'; end if;
  existing_count = public.set_service_assignees(p_organization_id, array[linked_project], p_assignees, true);
  generated_count = public.generate_service_deliverables(p_organization_id, linked_project);
  return query select linked_project, existing_count + generated_count, generated_count;
end $$;
revoke all on function public.connect_client_service(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.connect_client_service(uuid, uuid, uuid, uuid[]) to authenticated;

-- Delivery validation reads a definition while holding its row lock. This sorts
-- before guard_delivery_task, so an insert and a cadence edit cannot both pass
-- their checks against an unused definition and then commit overlapping work.
create function private.lock_delivery_definition()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.deliverable_definition_id is not null then
    perform d.id from public.service_deliverables d
      where d.organization_id = new.organization_id and d.id = new.deliverable_definition_id for share;
  end if;
  return new;
end $$;
revoke all on function private.lock_delivery_definition() from public, anon, authenticated;
create trigger delivery_definition_lock before insert on public.tasks
  for each row execute function private.lock_delivery_definition();

-- A used definition's cadence is part of its contractual history. Quantity and
-- instruction edits still affect future occurrences. A different cadence needs
-- a new definition, while prior tasks and explicit deletion markers stay intact.
-- This private definer reads hidden deletion markers after validating the caller.
create function private.guard_deliverable_cadence()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.cadence is not distinct from old.cadence then return new; end if;
  if (auth.uid() is null and pg_catalog.current_setting('role', true) in ('authenticated','anon'))
    or (auth.uid() is not null and not private.has_role(old.organization_id, array['owner','admin']::public.organization_role[])) then
    raise exception 'Only owners and admins can edit deliverables' using errcode = '42501';
  end if;
  if exists (select 1 from public.tasks t where t.organization_id = old.organization_id and t.deliverable_definition_id = old.id)
    or exists (select 1 from private.deleted_task_occurrences d where d.organization_id = old.organization_id and d.deliverable_definition_id = old.id) then
    raise exception 'This deliverable has task history. Add a new deliverable for a different cadence'
      using errcode = '23514', constraint = 'deliverable_cadence_history', hint = 'deliverable_cadence_history';
  end if;
  return new;
end $$;
revoke all on function private.guard_deliverable_cadence() from public, anon, authenticated;
create trigger guard_deliverable_cadence before update of cadence on public.service_deliverables
  for each row execute function private.guard_deliverable_cadence();

-- Keep status access for all workspace members, without general task UPDATE
-- access. A missing expected timestamp must fail just like a stale timestamp.
create or replace function public.change_task_status_for_member(
  p_organization_id uuid, p_task_id uuid, p_expected_updated_at timestamptz,
  p_status public.task_status, p_quantity integer default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  if auth.uid() is null or not private.is_member(p_organization_id) then
    raise exception 'Workspace access denied' using errcode = '42501';
  end if;
  select * into t from public.tasks where id = p_task_id and organization_id = p_organization_id for update;
  if not found or p_expected_updated_at is null or t.updated_at is distinct from p_expected_updated_at then return false; end if;
  if p_quantity is not null and (p_status <> 'done' or t.target_min is null or p_quantity <> t.target_min) then
    raise exception 'Invalid delivered quantity' using errcode = '22023';
  end if;
  if p_status = 'done' and t.target_min is not null and coalesce(p_quantity, t.completed_quantity, 0) < t.target_min then
    raise exception 'Delivered quantity required' using errcode = '22023';
  end if;
  update public.tasks set status = p_status, completed_quantity = coalesce(p_quantity, t.completed_quantity)
    where id = p_task_id and organization_id = p_organization_id;
  return true;
end $$;
revoke all on function public.change_task_status_for_member(uuid, uuid, timestamptz, public.task_status, integer) from public, anon;
grant execute on function public.change_task_status_for_member(uuid, uuid, timestamptz, public.task_status, integer) to authenticated;

notify pgrst, 'reload schema';
commit;
