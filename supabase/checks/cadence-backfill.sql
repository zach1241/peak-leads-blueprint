-- Targeted checks for this migration only. All fixtures are rolled back.
begin;
insert into auth.users(id,email) values
 ('10000000-0000-4000-8000-000000000001','resource-owner@example.test'),
 ('10000000-0000-4000-8000-000000000002','resource-member@example.test'),
 ('10000000-0000-4000-8000-000000000003','resource-outsider@example.test'),
 ('10000000-0000-4000-8000-000000000004','resource-admin@example.test');
insert into public.organizations(id,name,slug) values
 ('20000000-0000-4000-8000-000000000001','Resource test A','resource-test-a'),
 ('20000000-0000-4000-8000-000000000002','Resource test B','resource-test-b');
insert into public.organization_members(organization_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','admin'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','owner');
set local role authenticated;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.clients(id,organization_id,name,slug) values('31000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cadence client','cadence-client');
insert into public.service_templates(id,organization_id,code,name) values('32000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','cadence-test','Cadence test');
insert into public.service_deliverables(id,organization_id,service_template_id,code,name,cadence,operational_cadence,target_min,target_max,unit) values
 ('33000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','blogs','Blogs','monthly','weekly',4,4,'posts'),
 ('33000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','backlinks','Backlinks','monthly','biweekly',2,3,'links'),
 ('33000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','report','Report','monthly','monthly',1,1,'report');
insert into public.projects(id,organization_id,client_id,name,status,service_template_id,created_by) values('34000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Cadence project','active','32000000-0000-4000-8000-000000000001',auth.uid());

reset role;
alter table public.tasks disable trigger guard_delivery_task;
insert into public.tasks(id,organization_id,project_id,client_id,title,description,status,created_by,deliverable_definition_id,period_start,period_end,contract_start,contract_end,due_date,target_min,target_max,target_unit,completed_quantity)
select '35000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Legacy blogs','Source: Peak Leads Service Deliverables','todo',auth.uid(),'33000000-0000-4000-8000-000000000001',m,e,m,e,e,4,4,'posts',0
from (select date_trunc('month',now() at time zone 'Africa/Johannesburg')::date m,(date_trunc('month',now() at time zone 'Africa/Johannesburg')+interval '1 month - 1 day')::date e) dates;
insert into public.tasks(id,organization_id,project_id,client_id,title,description,status,created_by,deliverable_definition_id,period_start,period_end,contract_start,contract_end,due_date,target_min,target_max,target_unit,completed_quantity)
select '35000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','Started links','Source: Peak Leads Service Deliverables','in_progress',auth.uid(),'33000000-0000-4000-8000-000000000002',m,e,m,e,e,2,3,'links',1
from (select date_trunc('month',now() at time zone 'Africa/Johannesburg')::date m,(date_trunc('month',now() at time zone 'Africa/Johannesburg')+interval '1 month - 1 day')::date e) dates;
alter table public.tasks enable trigger guard_delivery_task;
insert into public.tasks(id,organization_id,title,status,created_by) values('35000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Untouched manual','todo',auth.uid());
insert into public.task_assignees(organization_id,task_id,user_id) values('20000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
create temporary table before_tasks as select id,to_jsonb(t) snapshot from public.tasks t where id in ('35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000003');
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
do $$ declare lo int; hi int; n int; begin
 if exists(select 1 from before_tasks b join public.tasks t using(id) where b.snapshot is distinct from to_jsonb(t)) then raise exception 'Started/manual task modified'; end if;
 select sum(target_min),sum(target_max),count(*) into lo,hi,n from public.tasks where deliverable_definition_id='33000000-0000-4000-8000-000000000001';
 if lo<>4 or hi<>4 or n<>4 then raise exception 'Backfill totals incorrect'; end if;
 if not exists(select 1 from public.tasks where id='35000000-0000-4000-8000-000000000001') then raise exception 'Original ID lost'; end if;
 if exists(select 1 from public.tasks t where deliverable_definition_id='33000000-0000-4000-8000-000000000001' and not exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id='10000000-0000-4000-8000-000000000002')) then raise exception 'Backfill assignments lost'; end if;
end $$;
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
do $$ declare lo int; hi int; n int; begin
 if exists(select 1 from before_tasks b join public.tasks t using(id) where b.snapshot is distinct from to_jsonb(t)) then raise exception 'Started/manual task modified'; end if;
 select sum(target_min),sum(target_max),count(*) into lo,hi,n from public.tasks where deliverable_definition_id='33000000-0000-4000-8000-000000000001';
 if lo<>4 or hi<>4 or n<>4 then raise exception 'Backfill totals incorrect'; end if;
 if not exists(select 1 from public.tasks where id='35000000-0000-4000-8000-000000000001') then raise exception 'Original ID lost'; end if;
 if exists(select 1 from public.tasks t where deliverable_definition_id='33000000-0000-4000-8000-000000000001' and not exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id='10000000-0000-4000-8000-000000000002')) then raise exception 'Backfill assignments lost'; end if;
end $$;
rollback;
