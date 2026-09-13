begin;
create table public.service_templates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 code text not null check(code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(char_length(name) between 1 and 120),
 source_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,code)
);
create table public.service_deliverables (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 service_template_id uuid not null,
 code text not null check(code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(char_length(name) between 1 and 160),
 cadence text not null check(cadence in ('weekly','monthly')),
 target_min integer not null check(target_min>0), target_max integer not null check(target_max>=target_min),
 unit text not null check(char_length(unit) between 1 and 40),
 instructions text not null default '', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,service_template_id) references public.service_templates(organization_id,id) on delete restrict,
 unique(organization_id,id), unique(organization_id,service_template_id,code)
);
create table public.managed_responsibilities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 client_id uuid not null, project_id uuid,
 source_key text not null, title text not null check(char_length(title) between 1 and 240),
 details text not null default '', status text not null default 'active' check(status in ('active','blocked','paused')),
 status_note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,client_id) references public.clients(organization_id,id) on delete cascade,
 foreign key(organization_id,project_id) references public.projects(organization_id,id) on delete restrict,
 unique(organization_id,client_id,source_key)
);
create index managed_responsibilities_project_idx on public.managed_responsibilities(organization_id,project_id);
alter table public.projects add column service_template_id uuid;
alter table public.projects add constraint projects_service_fkey foreign key(organization_id,service_template_id) references public.service_templates(organization_id,id) on delete restrict;
alter table public.projects add constraint service_requires_client check(service_template_id is null or client_id is not null);
create unique index project_service_unique on public.projects(organization_id,client_id,service_template_id) where service_template_id is not null;

alter table public.tasks
 add column deliverable_definition_id uuid,
 add column period_start date,
 add column period_end date,
 add column target_min integer,
 add column target_max integer,
 add column target_unit text,
 add column completed_quantity integer not null default 0 check(completed_quantity>=0);
alter table public.tasks add constraint tasks_deliverable_fkey foreign key(organization_id,deliverable_definition_id) references public.service_deliverables(organization_id,id) on delete restrict;
alter table public.tasks add constraint delivery_fields_consistent check(
 (deliverable_definition_id is null and period_start is null and period_end is null and target_min is null and target_max is null and target_unit is null and completed_quantity=0)
 or (deliverable_definition_id is not null and project_id is not null and client_id is not null and period_start is not null and period_end>=period_start and target_min>0 and target_max>=target_min and target_unit is not null and completed_quantity<=target_max)
);
create unique index task_delivery_period_unique on public.tasks(project_id,deliverable_definition_id,period_start) where deliverable_definition_id is not null;
create index tasks_delivery_org_period_idx on public.tasks(organization_id,period_start,period_end) where deliverable_definition_id is not null;

-- Use the existing caller-bound helpers; no new bypass of membership RLS.
do $$ declare t text; begin
 foreach t in array array['service_templates','service_deliverables','managed_responsibilities'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,delete on public.%I to authenticated',t);
  execute format('create policy tenant_read on public.%I for select to authenticated using(private.is_member(organization_id))',t);
  execute format('create policy admin_insert on public.%I for insert to authenticated with check(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t);
  execute format('create policy admin_delete on public.%I for delete to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t);
  execute format('create trigger touch_updated_at before update on public.%I for each row execute function private.touch_updated_at()',t);
  execute format('create trigger guard_record before update on public.%I for each row execute function private.guard_record()',t);
 end loop;
 foreach t in array array['service_templates','service_deliverables'] loop
  execute format('grant update on public.%I to authenticated',t);
  execute format('create policy admin_update on public.%I for update to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[])) with check(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t);
 end loop;
end $$;
grant update(status,status_note) on public.managed_responsibilities to authenticated;
create policy member_status on public.managed_responsibilities for update to authenticated using(private.is_member(organization_id)) with check(private.is_member(organization_id));

-- Protect service mappings even if a member calls the Data API directly.
create function private.guard_project_service() returns trigger language plpgsql set search_path='' as $$
begin
 if (tg_op='INSERT' and new.service_template_id is not null) or (tg_op='UPDATE' and new.service_template_id is distinct from old.service_template_id) then
  if not private.has_role(new.organization_id,array['owner','admin']::public.organization_role[]) then raise exception 'Only admins can change service mappings' using errcode='42501'; end if;
 end if;
 if tg_op='UPDATE' and old.service_template_id is not null and new.client_id is distinct from old.client_id then
  raise exception 'Service project client is immutable' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_project_service before insert or update on public.projects for each row execute function private.guard_project_service();

create function private.guard_responsibility_project() returns trigger language plpgsql set search_path='' as $$
begin
 if new.project_id is not null and not exists(select 1 from public.projects where id=new.project_id and organization_id=new.organization_id and client_id=new.client_id) then
  raise exception 'Responsibility project must belong to the same client' using errcode='23503';
 end if;
 return new;
end $$;
create trigger guard_responsibility_project before insert or update on public.managed_responsibilities for each row execute function private.guard_responsibility_project();

-- Snapshot targets on occurrence creation; template changes never rewrite past work.
create function private.guard_delivery_task() returns trigger language plpgsql set search_path='' as $$
declare definition public.service_deliverables; service_project public.projects; today date; expected_start date; expected_end date;
begin
 if tg_op='UPDATE' and (new.deliverable_definition_id is distinct from old.deliverable_definition_id or
   (old.deliverable_definition_id is not null and (
    new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or
    new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end or
    new.target_min is distinct from old.target_min or new.target_max is distinct from old.target_max or new.target_unit is distinct from old.target_unit))) then
  raise exception 'Delivery occurrence identity and targets are immutable' using errcode='42501';
 end if;
 if new.deliverable_definition_id is null then return new; end if;
 if tg_op='INSERT' then
  select * into definition from public.service_deliverables where id=new.deliverable_definition_id and organization_id=new.organization_id and active;
  select * into service_project from public.projects where id=new.project_id and organization_id=new.organization_id and status='active';
  if definition.id is null or service_project.id is null or service_project.service_template_id<>definition.service_template_id or service_project.service_template_id is null or service_project.client_id<>new.client_id then
   raise exception 'Active project/service mapping required' using errcode='23503';
  end if;
  today=(now() at time zone 'Africa/Johannesburg')::date;
  if definition.cadence='monthly' then
   expected_start=date_trunc('month',today)::date; expected_end=(expected_start+interval '1 month - 1 day')::date;
  else
   expected_start=date_trunc('week',today)::date;
   if extract(isodow from today)>=6 then expected_start=expected_start+7; end if;
   expected_end=expected_start+6;
  end if;
  if new.period_start is distinct from expected_start or new.period_end is distinct from expected_end then raise exception 'Only the current actionable delivery period may be generated' using errcode='22023'; end if;
  new.target_min=definition.target_min; new.target_max=definition.target_max; new.target_unit=definition.unit;
 end if;
 if tg_op='UPDATE' and new.completed_quantity is distinct from old.completed_quantity then
  new.status=case when new.completed_quantity>=new.target_min then 'done'::public.task_status when new.completed_quantity>0 then 'in_progress'::public.task_status else 'todo'::public.task_status end;
 end if;
 if new.status='done' and new.completed_quantity<new.target_min then raise exception 'Record the delivered quantity before completing this deliverable' using errcode='23514'; end if;
 return new;
end $$;
create trigger guard_delivery_task before insert or update on public.tasks for each row execute function private.guard_delivery_task();

create function public.generate_current_deliverables(p_organization_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare today date; week_start date; month_start date; inserted integer;
begin
 if auth.uid() is null or not private.is_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 today=(now() at time zone 'Africa/Johannesburg')::date;
 month_start=date_trunc('month',today)::date; week_start=date_trunc('week',today)::date;
 if extract(isodow from today)>=6 then week_start=week_start+7; end if;
 insert into public.tasks(organization_id,project_id,client_id,title,description,status,priority,due_date,created_by,deliverable_definition_id,period_start,period_end,target_min,target_max,target_unit)
 select p.organization_id,p.id,p.client_id,
  d.name || ' · ' || case when d.cadence='monthly' then to_char(month_start,'FMMonth YYYY') else 'Week of '||week_start::text end,
  'Target: '||d.target_min::text||case when d.target_max<>d.target_min then '–'||d.target_max::text else '' end||' '||d.unit||' / '||case when d.cadence='monthly' then 'month' else 'week' end||'. '||d.instructions||E'\nSource: Peak Leads Service Deliverables. Due date is the delivery-period end; no individual assignment was inferred.',
  'todo','medium',case when d.cadence='monthly' then (month_start+interval '1 month - 1 day')::date else week_start+6 end,
  auth.uid(),d.id,case when d.cadence='monthly' then month_start else week_start end,
  case when d.cadence='monthly' then (month_start+interval '1 month - 1 day')::date else week_start+6 end,d.target_min,d.target_max,d.unit
 from public.projects p join public.service_deliverables d on d.organization_id=p.organization_id and d.service_template_id=p.service_template_id
 where p.organization_id=p_organization_id and p.status='active' and d.active
 on conflict(project_id,deliverable_definition_id,period_start) where deliverable_definition_id is not null do nothing;
 get diagnostics inserted=row_count; return inserted;
end $$;
revoke all on function public.generate_current_deliverables(uuid) from public,anon;
grant execute on function public.generate_current_deliverables(uuid) to authenticated;

-- Responsibilities use the existing activity feed and link back to their project/client.
create function private.log_responsibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.status=old.status and new.status_note=old.status_note then return new; end if;
 insert into public.activity_logs(organization_id,actor_id,entity_type,entity_id,action,metadata)
 values(new.organization_id,auth.uid(),case when new.project_id is null then 'client' else 'project' end,coalesce(new.project_id,new.client_id),
  case when tg_op='INSERT' then 'added responsibility to' else 'updated responsibility for' end,jsonb_build_object('label',new.title,'responsibility_id',new.id));
 return new;
end $$;
create trigger log_responsibility after insert or update on public.managed_responsibilities for each row execute function private.log_responsibility();
revoke all on function private.guard_project_service(),private.guard_responsibility_project(),private.guard_delivery_task(),private.log_responsibility() from public;
commit;
