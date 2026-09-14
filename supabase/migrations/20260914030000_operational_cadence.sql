begin;
alter table public.service_deliverables add column operational_cadence text not null default 'monthly' check(operational_cadence in ('weekly','biweekly','monthly'));
update public.service_deliverables set operational_cadence=case
 when cadence='weekly' then 'weekly'
 when code in ('on-page','posts','reels') then 'weekly'
 when code in ('blogs','local-posts') then case when target_min>=4 then 'weekly' else 'biweekly' end
 when code in ('conversion-pages','backlinks') then 'biweekly'
 else 'monthly' end;
alter table public.tasks
 add column contract_start date,
 add column contract_end date,
 add column recurrence_type text not null default 'none' check(recurrence_type in ('none','weekly','biweekly','monthly')),
 add column recurrence_start date,
 add column recurrence_end date,
 add column recurrence_parent_id uuid;
alter table public.tasks add foreign key(organization_id,recurrence_parent_id) references public.tasks(organization_id,id) on delete restrict;
create unique index manual_occurrence_unique on public.tasks(recurrence_parent_id,period_start) where recurrence_parent_id is not null;
alter table public.tasks drop constraint delivery_fields_consistent;
alter table public.tasks add constraint delivery_fields_consistent check(
 (deliverable_definition_id is null and target_min is null and target_max is null and target_unit is null and completed_quantity=0 and contract_start is null and contract_end is null and ((period_start is null and period_end is null) or (period_start is not null and period_end>=period_start)))
 or (deliverable_definition_id is not null and project_id is not null and client_id is not null and period_start is not null and period_end>=period_start and target_min>0 and target_max>=target_min and target_unit is not null and completed_quantity<=target_max)
);
alter table public.tasks add constraint recurrence_dates_valid check(
 (recurrence_type='none' or (deliverable_definition_id is null and recurrence_parent_id is null and recurrence_start is not null and due_date is not null))
 and (recurrence_end is null or (recurrence_start is not null and recurrence_end>=recurrence_start))
 and (recurrence_parent_id is null or (deliverable_definition_id is null and recurrence_type='none'))
);
-- Stamp contractual snapshots without changing existing operational periods or work.
update public.tasks set contract_start=period_start,contract_end=period_end where deliverable_definition_id is not null;
alter table public.tasks add constraint contract_dates_valid check(deliverable_definition_id is null or (contract_start is not null and contract_end>=contract_start and period_start>=contract_start and period_end<=contract_end));

-- Calendar weeks intersect the month; biweekly blocks are pairs of those weeks.
-- Integer cumulative allocation conserves both ends of each contracted range.
create function public.delivery_slots(p_start date,p_end date,p_cadence text,p_min integer,p_max integer)
returns table(work_start date,work_end date,quantity_min integer,quantity_max integer)
language sql immutable set search_path='' as $$
 with periods as (
 select greatest(p_start,d::date) s,least(p_end,(d+case when p_cadence='biweekly' then interval '13 days' else interval '6 days' end)::date) e
 from generate_series(date_trunc('week',p_start)::date::timestamp,p_end::timestamp,case when p_cadence='biweekly' then interval '14 days' else interval '7 days' end) d
 where p_cadence in ('weekly','biweekly')
 union all select p_start,p_end where p_cadence='monthly'
 ), numbered as (select s,e,row_number() over(order by s)::integer i,count(*) over()::integer n from periods), quantities as (
 select s,e,ceil(i*p_min::numeric/n)::integer-ceil((i-1)*p_min::numeric/n)::integer lo,
 floor(ceil(i*p_min::numeric/n)*p_max/p_min)::integer-floor(ceil((i-1)*p_min::numeric/n)*p_max/p_min)::integer hi from numbered
 ) select s,e,lo,hi from quantities where lo>0 order by s;
$$;
revoke all on function public.delivery_slots(date,date,text,integer,integer) from public,anon;
grant execute on function public.delivery_slots(date,date,text,integer,integer) to authenticated;

create or replace function private.guard_delivery_task() returns trigger language plpgsql set search_path='' as $$
declare definition public.service_deliverables; project public.projects; begin
 if tg_op='UPDATE' and (new.deliverable_definition_id is distinct from old.deliverable_definition_id or
 (old.deliverable_definition_id is not null and (new.project_id is distinct from old.project_id or new.client_id is distinct from old.client_id or new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end or new.contract_start is distinct from old.contract_start or new.contract_end is distinct from old.contract_end or new.target_min is distinct from old.target_min or new.target_max is distinct from old.target_max or new.target_unit is distinct from old.target_unit))) then
 raise exception 'Delivery occurrence identity and targets are immutable' using errcode='42501'; end if;
 if new.deliverable_definition_id is null then return new; end if;
 if tg_op='INSERT' then
 select * into definition from public.service_deliverables where id=new.deliverable_definition_id and organization_id=new.organization_id and active;
 select * into project from public.projects where id=new.project_id and organization_id=new.organization_id and status='active';
 if definition.id is null or project.id is null or project.service_template_id is distinct from definition.service_template_id or project.client_id is distinct from new.client_id then raise exception 'Active project/service mapping required' using errcode='23503'; end if;
 if new.contract_start is null or new.contract_end is null then raise exception 'Contract period required' using errcode='22023'; end if;
 if definition.cadence='monthly' then
 if new.contract_start<>date_trunc('month',(now() at time zone 'Africa/Johannesburg'))::date or new.contract_end<>(new.contract_start+interval '1 month - 1 day')::date then raise exception 'Current contract month required' using errcode='22023'; end if;
 else
 if new.contract_start<>date_trunc('week',(now() at time zone 'Africa/Johannesburg'))::date+(case when extract(isodow from now() at time zone 'Africa/Johannesburg')>=6 then 7 else 0 end) or new.contract_end<>new.contract_start+6 then raise exception 'Current actionable contract week required' using errcode='22023'; end if;
 end if;
 if not exists(select 1 from public.delivery_slots(new.contract_start,new.contract_end,case when definition.cadence='weekly' then 'monthly' else definition.operational_cadence end,definition.target_min,definition.target_max) s where s.work_start=new.period_start and s.work_end=new.period_end and s.quantity_min=new.target_min and s.quantity_max=new.target_max) or new.target_unit is distinct from definition.unit then raise exception 'Invalid operational quantity or period' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and new.completed_quantity is distinct from old.completed_quantity then
 new.status=case when new.completed_quantity>=new.target_min then 'done'::public.task_status when new.completed_quantity>0 then 'in_progress'::public.task_status else 'todo'::public.task_status end;
 end if;
 if new.status='done' and new.completed_quantity<new.target_min then raise exception 'Record the delivered quantity before completing this deliverable' using errcode='23514'; end if;
 return new;
end $$;

-- Backfill only untouched, provably generated CURRENT monthly tasks. Keep the
-- original ID, comments and audit history on the first slot. Copy all assignees.
-- A whole-month row with progress or a changed status is intentionally retained.
alter table public.tasks disable trigger guard_delivery_task;
do $$ declare t record; s record; first_slot boolean; child uuid; begin
 for t in select task.*,d.operational_cadence from public.tasks task join public.service_deliverables d on d.id=task.deliverable_definition_id
 where d.cadence='monthly' and d.operational_cadence<>'monthly'
 and task.contract_start=date_trunc('month',now() at time zone 'Africa/Johannesburg')::date
 and task.period_start=task.contract_start and task.period_end=task.contract_end
 and task.completed_quantity=0 and task.status='todo' and task.description like '%Source: Peak Leads Service Deliverables%'
 and not exists(select 1 from public.activity_logs a where a.entity_id=task.id and (a.action='completed' or (a.action='status_changed' and a.metadata->>'previous_status' is not null)))
 loop
 first_slot=true;
 for s in select * from public.delivery_slots(t.contract_start,t.contract_end,t.operational_cadence,t.target_min,t.target_max) loop
 if first_slot then
 update public.tasks set period_start=s.work_start,period_end=s.work_end,due_date=s.work_end,target_min=s.quantity_min,target_max=s.quantity_max where id=t.id;
 child=t.id;first_slot=false;
 else
 insert into public.tasks(organization_id,project_id,client_id,title,description,status,priority,due_date,created_by,deliverable_definition_id,period_start,period_end,contract_start,contract_end,target_min,target_max,target_unit)
 values(t.organization_id,t.project_id,t.client_id,t.title,t.description,'todo',t.priority,s.work_end,t.created_by,t.deliverable_definition_id,s.work_start,s.work_end,t.contract_start,t.contract_end,s.quantity_min,s.quantity_max,t.target_unit)
 on conflict(project_id,deliverable_definition_id,period_start) where deliverable_definition_id is not null do nothing returning id into child;
 if child is not null then insert into public.task_assignees(organization_id,task_id,user_id) select organization_id,child,user_id from public.task_assignees where task_id=t.id on conflict(task_id,user_id) do nothing; end if;
 end if;
 end loop;
 end loop;
end $$;
alter table public.tasks enable trigger guard_delivery_task;

create function public.manual_due(p_anchor date,p_cadence text,p_index integer) returns date language sql immutable set search_path='' as $$
 select case when p_cadence='monthly' then least((date_trunc('month',p_anchor)+make_interval(months=>p_index)+(extract(day from p_anchor)::integer-1)*interval '1 day')::date,(date_trunc('month',p_anchor)+make_interval(months=>p_index+1)-interval '1 day')::date)
 when p_cadence='biweekly' then p_anchor+p_index*14 else p_anchor+p_index*7 end;
$$;
revoke all on function public.manual_due(date,text,integer) from public,anon;
grant execute on function public.manual_due(date,text,integer) to authenticated;
create function private.guard_manual_recurrence() returns trigger language plpgsql set search_path='' as $$
declare parent public.tasks; begin
 if tg_op='UPDATE' and new.recurrence_parent_id is distinct from old.recurrence_parent_id then raise exception 'Recurrence parent is immutable' using errcode='42501'; end if;
 if new.deliverable_definition_id is not null then
 if new.recurrence_type<>'none' or new.recurrence_parent_id is not null then raise exception 'Service tasks use service cadence' using errcode='23514'; end if;
 return new;
 end if;
 if new.recurrence_type<>'none' then
 new.recurrence_start=coalesce(new.recurrence_start,new.due_date);
 if new.recurrence_start is null or new.due_date is null then raise exception 'A due date is required for recurrence' using errcode='23514'; end if;
 new.period_start=case when new.recurrence_type='monthly' then date_trunc('month',new.due_date)::date when new.recurrence_type='biweekly' then new.due_date-13 else new.due_date-6 end;
 new.period_end=case when new.recurrence_type='monthly' then (date_trunc('month',new.due_date)+interval '1 month - 1 day')::date else new.due_date end;
 end if;
 if new.recurrence_parent_id is not null and tg_op='INSERT' then
 select * into parent from public.tasks where id=new.recurrence_parent_id and organization_id=new.organization_id and recurrence_type<>'none';
 if parent.id is null then raise exception 'Active recurrence parent required' using errcode='23503'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_manual_recurrence() from public;
create trigger guard_manual_recurrence before insert or update on public.tasks for each row execute function private.guard_manual_recurrence();
grant update(recurrence_type,recurrence_start,recurrence_end) on public.tasks to authenticated;

drop function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[]);
create function public.save_task(p_organization_id uuid,p_id uuid,p_title text,p_description text,p_status public.task_status,p_priority public.task_priority,p_due_date date,p_project_id uuid,p_client_id uuid,p_assignees uuid[],p_recurrence_type text default 'none',p_recurrence_start date default null,p_recurrence_end date default null)
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
 delete from public.task_assignees where task_id=result and organization_id=p_organization_id and not(user_id=any(coalesce(p_assignees,'{}'::uuid[])));
 insert into public.task_assignees(organization_id,task_id,user_id) select p_organization_id,result,u from unnest(coalesce(p_assignees,'{}'::uuid[])) u on conflict(task_id,user_id) do nothing;
 if p_recurrence_type<>'none' then perform public.generate_current_deliverables(p_organization_id); end if;
 return result;
end $$;
revoke all on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[],text,date,date) from public,anon;
grant execute on function public.save_task(uuid,uuid,text,text,public.task_status,public.task_priority,date,uuid,uuid,uuid[],text,date,date) to authenticated;

create or replace function public.generate_current_deliverables(p_organization_id uuid) returns integer language plpgsql security invoker set search_path='' as $$
declare today date=(now() at time zone 'Africa/Johannesburg')::date; month_start date; month_end date; week_start date; d record; s record; root public.tasks; cs date; ce date; inserted integer=0; n integer; idx integer; first_idx integer; last_idx integer; due date; ws date; we date; child uuid;
begin
 if auth.uid() is null or not private.is_member(p_organization_id) then raise exception 'Workspace access required' using errcode='42501'; end if;
 month_start=date_trunc('month',today)::date; month_end=(month_start+interval '1 month - 1 day')::date;
 week_start=date_trunc('week',today)::date+case when extract(isodow from today)>=6 then 7 else 0 end;
 for d in select sd.*,p.id project_id,p.client_id from public.projects p join public.service_deliverables sd on sd.organization_id=p.organization_id and sd.service_template_id=p.service_template_id where p.organization_id=p_organization_id and p.status='active' and sd.active loop
 cs=case when d.cadence='weekly' then week_start else month_start end; ce=case when d.cadence='weekly' then week_start+6 else month_end end;
 -- A preserved whole-contract occurrence owns this period. Never duplicate its work.
 if exists(select 1 from public.tasks t where t.project_id=d.project_id and t.deliverable_definition_id=d.id and t.contract_start=cs and t.contract_end=ce and t.period_start=cs and t.period_end=ce) then continue; end if;
 for s in select * from public.delivery_slots(cs,ce,case when d.cadence='weekly' then 'monthly' else d.operational_cadence end,d.target_min,d.target_max) loop
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
 first_idx=greatest(0,ceil((month_start-root.recurrence_start)::numeric/n)::int);last_idx=floor((month_end-root.recurrence_start)::numeric/n)::int;
 end if;
 for idx in first_idx..last_idx loop
 due=public.manual_due(root.recurrence_start,root.recurrence_type,idx);
 if due<month_start or due>month_end or due=root.due_date or (root.recurrence_end is not null and due>root.recurrence_end) then continue; end if;
 ws=case when root.recurrence_type='monthly' then date_trunc('month',due)::date when root.recurrence_type='biweekly' then due-13 else due-6 end;
 we=case when root.recurrence_type='monthly' then (date_trunc('month',due)+interval '1 month - 1 day')::date else due end;
 if exists(select 1 from public.tasks t where (t.recurrence_parent_id=root.id or t.id=root.id) and t.period_start<=we and t.period_end>=ws) then continue; end if;
 insert into public.tasks(organization_id,project_id,client_id,title,description,status,priority,due_date,created_by,period_start,period_end,recurrence_parent_id)
 values(root.organization_id,root.project_id,root.client_id,root.title,root.description,'todo',root.priority,due,auth.uid(),ws,we,root.id)
 on conflict(recurrence_parent_id,period_start) where recurrence_parent_id is not null do nothing returning id into child;
 if child is not null then
 inserted=inserted+1;
 insert into public.task_assignees(organization_id,task_id,user_id) select organization_id,child,user_id from public.task_assignees where task_id=root.id on conflict(task_id,user_id) do nothing;
 end if;
 end loop;
 end loop;
 return inserted;
end $$;
commit;
