begin;
lock table public.tasks, public.task_assignees in share row exclusive mode;
-- A series belongs to one client/project + deliverable, or one manual source task.
-- A rule with zero members intentionally means future occurrences are unassigned.
create table public.recurring_assignment_rules (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 project_id uuid,
 deliverable_definition_id uuid,
 source_task_id uuid,
 check ((project_id is not null and deliverable_definition_id is not null and source_task_id is null)
     or (project_id is null and deliverable_definition_id is null and source_task_id is not null)),
 constraint recurring_assignment_rules_project_fkey foreign key(organization_id,project_id) references public.projects(organization_id,id) on delete cascade,
 constraint recurring_assignment_rules_deliverable_fkey foreign key(organization_id,deliverable_definition_id) references public.service_deliverables(organization_id,id) on delete cascade,
 constraint recurring_assignment_rules_source_fkey foreign key(organization_id,source_task_id) references public.tasks(organization_id,id) on delete cascade,
 unique(organization_id,id)
);
create unique index recurring_assignment_service on public.recurring_assignment_rules(project_id,deliverable_definition_id) where source_task_id is null;
create unique index recurring_assignment_manual on public.recurring_assignment_rules(source_task_id) where source_task_id is not null;
create table public.recurring_assignment_members (
 organization_id uuid not null,
 rule_id uuid not null,
 user_id uuid not null,
 primary key(rule_id,user_id),
 constraint recurring_assignment_members_rule_fkey foreign key(organization_id,rule_id) references public.recurring_assignment_rules(organization_id,id) on delete cascade,
 constraint recurring_assignment_members_member_fkey foreign key(organization_id,user_id) references public.organization_members(organization_id,user_id) on delete cascade
);
alter table public.recurring_assignment_rules enable row level security;
alter table public.recurring_assignment_members enable row level security;
-- Defaults are only writable through the validated atomic RPC, never directly.
revoke all on public.recurring_assignment_rules, public.recurring_assignment_members from public,anon,authenticated;
grant select on public.recurring_assignment_rules, public.recurring_assignment_members to authenticated;
create policy rules_read on public.recurring_assignment_rules for select to authenticated using(private.is_member(organization_id));
create policy members_read on public.recurring_assignment_members for select to authenticated using(private.is_member(organization_id));

-- Preserve the most recently assigned service occurrence as the initial default.
-- Existing occurrences (including this month's empty task) are never overwritten.
insert into public.recurring_assignment_rules(organization_id,project_id,deliverable_definition_id)
 select distinct t.organization_id,t.project_id,t.deliverable_definition_id from public.tasks t
 where t.deliverable_definition_id is not null and exists(select 1 from public.task_assignees a where a.task_id=t.id);
insert into public.recurring_assignment_members(organization_id,rule_id,user_id)
 select r.organization_id,r.id,a.user_id from public.recurring_assignment_rules r
 join lateral (select t.id from public.tasks t where t.organization_id=r.organization_id and t.project_id=r.project_id and t.deliverable_definition_id=r.deliverable_definition_id and exists(select 1 from public.task_assignees a where a.task_id=t.id) order by t.period_start desc nulls last,t.created_at desc,t.id desc limit 1) latest on true
 join public.task_assignees a on a.task_id=latest.id;
insert into public.recurring_assignment_rules(organization_id,source_task_id)
 select organization_id,id from public.tasks where recurrence_type<>'none' and recurrence_parent_id is null;
insert into public.recurring_assignment_members(organization_id,rule_id,user_id)
 select r.organization_id,r.id,a.user_id from public.recurring_assignment_rules r join public.task_assignees a on a.task_id=r.source_task_id;

-- Definer is limited to assignment defaults, with explicit caller role, tenant and
-- membership checks. Current task assignment still uses the existing invoker RPC.
create function private.save_recurring_assignments(p_organization_id uuid,p_task_id uuid,p_assignees uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare t public.tasks; rule uuid; source uuid;
begin
 if auth.uid() is null or not private.has_role(p_organization_id,array['owner','admin']::public.organization_role[]) then
  raise exception 'Only owners and admins can change recurring assignments' using errcode='42501'; end if;
 select * into t from public.tasks where organization_id=p_organization_id and id=p_task_id;
 if not found then raise exception 'Task not found in this workspace' using errcode='42501'; end if;
 if cardinality(p_assignees)>100 or exists(select 1 from unnest(coalesce(p_assignees,'{}'::uuid[])) u where u is null or not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=u)) then
  raise exception 'Choose up to 100 members of this workspace' using errcode='23503'; end if;
 if t.deliverable_definition_id is not null then
  insert into public.recurring_assignment_rules(organization_id,project_id,deliverable_definition_id)
   values(t.organization_id,t.project_id,t.deliverable_definition_id)
   on conflict(project_id,deliverable_definition_id) where source_task_id is null do update set project_id=excluded.project_id returning id into rule;
 else
  source=coalesce(t.recurrence_parent_id,t.id);
  if not exists(select 1 from public.tasks where id=source and organization_id=p_organization_id and recurrence_type<>'none' and recurrence_parent_id is null) then
   raise exception 'This task does not repeat' using errcode='22023'; end if;
  insert into public.recurring_assignment_rules(organization_id,source_task_id) values(t.organization_id,source)
   on conflict(source_task_id) where source_task_id is not null do update set source_task_id=excluded.source_task_id returning id into rule;
 end if;
 delete from public.recurring_assignment_members where rule_id=rule;
 insert into public.recurring_assignment_members(organization_id,rule_id,user_id)
  select p_organization_id,rule,u from unnest(coalesce(p_assignees,'{}'::uuid[])) u on conflict do nothing;
end $$;
revoke all on function private.save_recurring_assignments(uuid,uuid,uuid[]) from public,anon;
grant execute on function private.save_recurring_assignments(uuid,uuid,uuid[]) to authenticated;

-- Retain the old three-argument RPC for older clients, preserving one-off edits.
create function public.set_task_assignees(p_organization_id uuid,p_task_id uuid,p_assignees uuid[],p_apply_to_future boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform public.set_task_assignees(p_organization_id,p_task_id,p_assignees);
 if p_apply_to_future then perform private.save_recurring_assignments(p_organization_id,p_task_id,p_assignees); end if;
end $$;
revoke all on function public.set_task_assignees(uuid,uuid,uuid[],boolean) from public,anon;
grant execute on function public.set_task_assignees(uuid,uuid,uuid[],boolean) to authenticated;

-- Generation snapshots defaults only into new tasks; it never rewrites history.
create function private.inherit_recurring_assignments() returns trigger language plpgsql security definer set search_path='' as $$
declare rule uuid;
begin
 if new.deliverable_definition_id is null and new.recurrence_parent_id is null then return new; end if;
 if auth.uid() is not null and not private.has_role(new.organization_id,array['owner','admin']::public.organization_role[]) then
  raise exception 'Only owners and admins can generate assigned tasks' using errcode='42501'; end if;
 if new.deliverable_definition_id is not null then
  select id into rule from public.recurring_assignment_rules where organization_id=new.organization_id and project_id=new.project_id and deliverable_definition_id=new.deliverable_definition_id for share;
 elsif new.recurrence_parent_id is not null then
  select id into rule from public.recurring_assignment_rules where organization_id=new.organization_id and source_task_id=new.recurrence_parent_id for share;
  if rule is null then
   insert into public.task_assignees(organization_id,task_id,user_id)
    select new.organization_id,new.id,a.user_id from public.task_assignees a where a.task_id=new.recurrence_parent_id on conflict(task_id,user_id) do nothing;
  end if;
 end if;
 if rule is not null then
  insert into public.task_assignees(organization_id,task_id,user_id)
   select new.organization_id,new.id,m.user_id from public.recurring_assignment_members m where m.rule_id=rule on conflict(task_id,user_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.inherit_recurring_assignments() from public;
create trigger inherit_recurring_assignments after insert on public.tasks for each row execute function private.inherit_recurring_assignments();

-- Replace the old save signature to avoid ambiguity from default arguments.
drop function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[],text,date,date);
create function public.save_task(p_organization_id uuid,p_id uuid,p_title text,p_description text,p_status public.task_status,p_priority public.task_priority,p_due_date date,p_project_id uuid,p_client_id uuid,p_assignees uuid[],p_recurrence_type text default 'none',p_recurrence_start date default null,p_recurrence_end date default null,p_apply_to_future boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result uuid; begin
 if auth.uid() is null or not private.is_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 if cardinality(p_assignees)>100 then raise exception 'Too many assignees' using errcode='22023'; end if;
 if p_id is null then
 insert into public.tasks(organization_id,title,description,status,priority,due_date,project_id,client_id,created_by,recurrence_type,recurrence_start,recurrence_end)
 values(p_organization_id,p_title,p_description,p_status,p_priority,p_due_date,p_project_id,p_client_id,auth.uid(),p_recurrence_type,p_recurrence_start,p_recurrence_end) returning id into result;
 else
 update public.tasks set title=p_title,description=p_description,status=p_status,priority=p_priority,due_date=p_due_date,project_id=p_project_id,client_id=p_client_id,recurrence_type=p_recurrence_type,recurrence_start=p_recurrence_start,recurrence_end=p_recurrence_end where id=p_id and organization_id=p_organization_id returning id into result;
 if result is null then raise exception 'Task not found' using errcode='42501'; end if;
 end if;
 perform public.set_task_assignees(p_organization_id,result,p_assignees,p_apply_to_future);
 if p_recurrence_type<>'none' then
  -- Capture the initial assignees once, including when a one-off task starts repeating.
  if not exists(select 1 from public.recurring_assignment_rules where organization_id=p_organization_id and source_task_id=result) then
   perform private.save_recurring_assignments(p_organization_id,result,p_assignees);
  end if;
  perform public.generate_current_deliverables(p_organization_id);
 end if;
 return result;
end $$;
revoke all on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[],text,date,date,boolean) from public,anon;
grant execute on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[],text,date,date,boolean) to authenticated;


create or replace function public.generate_current_deliverables(p_organization_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare today date=(now() at time zone 'Africa/Johannesburg')::date; month_start date; month_end date; week_start date; d record; s record; root public.tasks; cs date; ce date; inserted integer=0; n integer; idx integer; first_idx integer; last_idx integer; due date; ws date; we date; child uuid;
begin
 if auth.uid() is null or not private.is_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 month_start=date_trunc('month',today)::date; month_end=(month_start+interval '1 month - 1 day')::date;
 week_start=date_trunc('week',today)::date;
 for d in select sd.*,p.id project_id,p.client_id from public.projects p join public.service_deliverables sd on sd.organization_id=p.organization_id and sd.service_template_id=p.service_template_id where p.organization_id=p_organization_id and p.status='active' and sd.active loop
 cs=case when d.cadence='weekly' then week_start else month_start end; ce=case when d.cadence='weekly' then week_start+6 else month_end end;
 -- A preserved whole-contract occurrence owns this period. Never duplicate its work.
 if exists(select 1 from public.tasks t where t.project_id=d.project_id and t.deliverable_definition_id=d.id and t.contract_start=cs and t.contract_end=ce and t.period_start=cs and t.period_end=ce) then continue; end if;
 for s in select cs work_start,ce work_end,d.target_min quantity_min,d.target_max quantity_max loop
 insert into public.tasks(organization_id,project_id,client_id,title,description,status,priority,due_date,created_by,deliverable_definition_id,period_start,period_end,contract_start,contract_end,target_min,target_max,target_unit)
 values(p_organization_id,d.project_id,d.client_id,d.name||' · '||s.work_start::text,'Source: Peak Leads Service Deliverables. Contract: '||cs::text||' – '||ce::text||'. '||d.instructions,'todo','medium',s.work_end,auth.uid(),d.id,s.work_start,s.work_end,cs,ce,s.quantity_min,s.quantity_max,d.unit)
 on conflict(project_id,deliverable_definition_id,period_start) where deliverable_definition_id is not null do nothing;
 get diagnostics n=row_count;inserted=inserted+n;
 end loop;
 end loop;
 for root in select * from public.tasks where organization_id=p_organization_id and recurrence_type<>'none' and recurrence_parent_id is null loop
 if root.recurrence_type='monthly' then
 first_idx=greatest(0,(extract(year from month_start)::int-extract(year from root.recurrence_start)::int)*12+extract(month from month_start)::int-extract(month from root.recurrence_start)::int);last_idx=first_idx;
 else
 n=case when root.recurrence_type='biweekly' then 14 else 7 end;
 first_idx=greatest(0,ceil((today-root.recurrence_start)::numeric/n)::int);last_idx=first_idx;
 end if;
 for idx in first_idx..last_idx loop
 due=public.manual_due(root.recurrence_start,root.recurrence_type,idx);
 if due=root.due_date or (root.recurrence_end is not null and due>root.recurrence_end) then continue; end if;
 ws=case when root.recurrence_type='monthly' then date_trunc('month',due)::date when root.recurrence_type='biweekly' then due-13 else due-6 end;
 we=case when root.recurrence_type='monthly' then (date_trunc('month',due)+interval '1 month - 1 day')::date else due end;
 if today<ws or today>we then continue; end if;
 if exists(select 1 from public.tasks t where (t.recurrence_parent_id=root.id or t.id=root.id) and t.period_start<=we and t.period_end>=ws) then continue; end if;
 insert into public.tasks(organization_id,project_id,client_id,title,description,status,priority,due_date,created_by,period_start,period_end,recurrence_parent_id)
 values(root.organization_id,root.project_id,root.client_id,root.title,root.description,'todo',root.priority,due,auth.uid(),ws,we,root.id)
 on conflict(recurrence_parent_id,period_start) where recurrence_parent_id is not null do nothing returning id into child;
 if child is not null then
 inserted=inserted+1;
 -- Assignment inheritance is handled by the task insert trigger.
 end if;
 end loop;
 end loop;
 return inserted;
end $$;
commit;
