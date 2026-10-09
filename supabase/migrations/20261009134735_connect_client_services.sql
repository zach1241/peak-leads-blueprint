begin;

-- Generate only the requested service project's current contractual occurrences.
-- Keep the established generator's dates, full-period targets and unique keys.
create function public.generate_service_deliverables(p_organization_id uuid, p_project_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare project public.projects; d record; cs date; ce date;
  today date = (now() at time zone 'Africa/Johannesburg')::date;
  month_start date; month_end date; week_start date; inserted integer = 0; n integer;
begin
  if auth.uid() is null or not private.has_role(p_organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can generate service work' using errcode = '42501';
  end if;
  select p.* into project from public.projects p
    where p.organization_id = p_organization_id and p.id = p_project_id for update;
  if not found then raise exception 'Project not found in this workspace' using errcode = '42501'; end if;
  if project.service_template_id is null then raise exception 'This project is not connected to a service' using errcode = '22023'; end if;
  if project.status <> 'active' then return 0; end if;
  month_start = date_trunc('month', today)::date;
  month_end = (month_start + interval '1 month - 1 day')::date;
  week_start = date_trunc('week', today)::date;
  for d in select sd.* from public.service_deliverables sd
    where sd.organization_id = p_organization_id and sd.service_template_id = project.service_template_id and sd.active
    order by sd.id loop
    cs = case when d.cadence = 'weekly' then week_start else month_start end;
    ce = case when d.cadence = 'weekly' then week_start + 6 else month_end end;
    if exists(select 1 from public.tasks t where t.organization_id = p_organization_id
      and t.project_id = project.id and t.deliverable_definition_id = d.id
      and t.contract_start = cs and t.contract_end = ce and t.period_start = cs and t.period_end = ce) then
      continue;
    end if;
    insert into public.tasks(organization_id, project_id, client_id, title, description, status, priority,
      due_date, created_by, deliverable_definition_id, period_start, period_end, contract_start, contract_end,
      target_min, target_max, target_unit)
    values(p_organization_id, project.id, project.client_id, d.name || ' · ' || cs::text,
      'Source: Peak Leads Service Deliverables. Contract: ' || cs::text || ' – ' || ce::text || '. ' || d.instructions,
      'todo', 'medium', ce, auth.uid(), d.id, cs, ce, cs, ce, d.target_min, d.target_max, d.unit)
    on conflict(project_id, deliverable_definition_id, period_start) where deliverable_definition_id is not null do nothing;
    get diagnostics n = row_count;
    inserted = inserted + n;
  end loop;
  return inserted;
end $$;
revoke all on function public.generate_service_deliverables(uuid, uuid) from public, anon;
grant execute on function public.generate_service_deliverables(uuid, uuid) to authenticated;

-- Connect an existing service template, save its team, then generate only this
-- client's new service work. Reconnecting reuses the link and retains its status.
create function public.connect_client_service(
  p_organization_id uuid, p_client_id uuid, p_service_template_id uuid, p_assignees uuid[]
) returns table(project_id uuid, tasks_assigned integer, tasks_generated integer)
language plpgsql security invoker set search_path = '' as $$
declare service public.service_templates; linked_project uuid; existing_count integer; generated_count integer;
begin
  if auth.uid() is null or not private.has_role(p_organization_id, array['owner','admin']::public.organization_role[]) then
    raise exception 'Only owners and admins can connect client services' using errcode = '42501';
  end if;
  if p_assignees is null or cardinality(p_assignees) > 100
    or exists(select 1 from unnest(p_assignees) u where u is null) then
    raise exception 'Choose up to 100 workspace members, or an empty list to leave work unassigned' using errcode = '22023';
  end if;
  -- Client first, then project: simultaneous connects for one client serialize.
  perform c.id from public.clients c
    where c.organization_id = p_organization_id and c.id = p_client_id for update;
  if not found then raise exception 'Client not found in this workspace' using errcode = '42501'; end if;
  select st.* into service from public.service_templates st
    where st.organization_id = p_organization_id and st.id = p_service_template_id for share;
  if not found then raise exception 'Service not found in this workspace' using errcode = '42501'; end if;
  if exists(select 1 from unnest(p_assignees) u where not exists(
    select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = u
  )) then raise exception 'Choose members of this workspace' using errcode = '23503'; end if;

  insert into public.projects(organization_id, client_id, service_template_id, name, status, created_by)
    values(p_organization_id, p_client_id, p_service_template_id, service.name, 'active', auth.uid())
    on conflict(organization_id, client_id, service_template_id) where service_template_id is not null do nothing
    returning id into linked_project;
  if linked_project is null then
    select p.id into linked_project from public.projects p
      where p.organization_id = p_organization_id and p.client_id = p_client_id
        and p.service_template_id = p_service_template_id for update;
  end if;
  if linked_project is null then raise exception 'Client service link could not be found' using errcode = '42501'; end if;
  existing_count = public.set_service_assignees(p_organization_id, array[linked_project], p_assignees, true);
  generated_count = public.generate_service_deliverables(p_organization_id, linked_project);
  return query select linked_project, existing_count + generated_count, generated_count;
end $$;
revoke all on function public.connect_client_service(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.connect_client_service(uuid, uuid, uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
