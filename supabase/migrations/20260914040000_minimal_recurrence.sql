begin;
-- Exact split IDs from the before/after snapshots of 20260914030000.
-- No heuristic matching of manually created work; absent IDs are harmless locally.
lock table public.tasks, public.task_assignees, public.comments in share row exclusive mode;
create temporary table collapsed_tasks(child uuid primary key, survivor uuid not null) on commit drop;
insert into collapsed_tasks values
 ('0d8d15cf-9eb8-4927-a1fe-b421d3d9d44d','0124c2b5-1679-44cf-9a26-57071cca2987'),
 ('e3319c44-4136-4020-b836-13c148e7d6b9','c63085a7-f660-4a6e-91eb-23bc7879ca5d'),
 ('b5230c85-70f7-4521-8a3a-1717f651523e','c63085a7-f660-4a6e-91eb-23bc7879ca5d'),
 ('7b2b0703-5340-463e-99a2-60f6df1f95cf','c63085a7-f660-4a6e-91eb-23bc7879ca5d'),
 ('82afef09-c273-4e2e-a71d-ac0484a8d418','8174abdf-e134-43d2-8036-a2bb22926825'),
 ('81813340-c5a3-46d1-b1bc-f24fde72799b','e1ba9651-897a-4134-b3d3-5aa0eabda7ac'),
 ('611c1551-e443-4f74-8fde-720ce9937859','e1ba9651-897a-4134-b3d3-5aa0eabda7ac'),
 ('23b2e376-73f8-48f5-9374-f020789f231c','e1ba9651-897a-4134-b3d3-5aa0eabda7ac'),
 ('df8a9991-97a4-4260-8309-6afc1f3dd1b9','80e650d4-a15b-46e9-ba36-e915c2b1cb18'),
 ('a0795c9d-d515-43f3-836f-5a24a8f48c56','80e650d4-a15b-46e9-ba36-e915c2b1cb18'),
 ('a2bd04c3-ec0c-4563-9ed8-68dcc728771c','80e650d4-a15b-46e9-ba36-e915c2b1cb18'),
 ('bc2fb66f-9a23-4a9e-b7ae-be291121bf82','80e650d4-a15b-46e9-ba36-e915c2b1cb18'),
 ('d55a425c-a7cc-4ca1-b4e3-31c1ff7b6ad3','6bbc7a41-448f-4b76-8c88-e2054feb25d2'),
 ('d60fed10-a768-4788-9583-bd7b09fab2ca','6bbc7a41-448f-4b76-8c88-e2054feb25d2'),
 ('2bc8f3d0-7c37-4813-95ad-2bf319a5d671','6bbc7a41-448f-4b76-8c88-e2054feb25d2'),
 ('46d80cbf-18a7-4a77-b10a-ecdd7fbd68bb','6bbc7a41-448f-4b76-8c88-e2054feb25d2'),
 ('5977d243-d466-4a20-901c-36b778d3e0c6','0436c7bf-a0a5-4b53-a5ec-83bbe568dfcf'),
 ('64ee82b5-5fee-4fdb-aa7e-044655ea8c8d','0436c7bf-a0a5-4b53-a5ec-83bbe568dfcf'),
 ('99dc142d-9b7f-4868-85e6-1b3ddcade8ec','0436c7bf-a0a5-4b53-a5ec-83bbe568dfcf'),
 ('ce483da4-c8bb-4896-9ee6-660d8199f003','46c56218-b7ef-4904-94c7-cf47ea144aa4'),
 ('e1e44cc8-9f02-4fe8-977f-00ad24f1d4b9','c7892d18-c49c-4a9f-bba9-3ecaf35a147b'),
 ('62fd6a21-5616-47d0-b16e-513fa2ed4ebf','c7892d18-c49c-4a9f-bba9-3ecaf35a147b'),
 ('d647da92-4c31-491f-9904-fb23c75a9f3b','c7892d18-c49c-4a9f-bba9-3ecaf35a147b'),
 ('10c6dba8-d6ae-476b-859e-55a7e00fc82b','02d7b5ea-ddfa-430e-8608-6141baa633dc'),
 ('5dc7bc7b-d2e1-4706-b780-f8e8f1c47bea','0aa0732a-beb1-495f-8fe0-965b32965468'),
 ('3e467012-3e36-4e6b-b40e-de07dfa0836e','0aa0732a-beb1-495f-8fe0-965b32965468'),
 ('dc49bdb9-ada0-4e79-91a1-84a2ddc3cf91','0aa0732a-beb1-495f-8fe0-965b32965468'),
 ('6bcf9840-d442-4822-90a7-47e232343875','fb5d7e9d-e90e-4e68-b2a7-a605434ca0d4'),
 ('c4c808f8-656f-46cd-b962-56bae90bb4e9','fb5d7e9d-e90e-4e68-b2a7-a605434ca0d4'),
 ('fc09fa65-57d4-48b2-932d-0a3bf5ecd3ff','fb5d7e9d-e90e-4e68-b2a7-a605434ca0d4'),
 ('2a7e4ab7-3efb-4507-8e8b-c93a9b730a9a','fb5d7e9d-e90e-4e68-b2a7-a605434ca0d4'),
 ('6cd41660-152e-45b6-8d9e-95df9f6bccf4','bd8664d9-f938-40b6-82a8-f01168e379a2'),
 ('85b5dbd5-e741-415e-8769-6d1f2ce07b46','1c32cc39-1e93-4edb-af20-2cf0473d0d3c'),
 ('525c4796-d477-441d-820d-8a950585aa42','1c32cc39-1e93-4edb-af20-2cf0473d0d3c'),
 ('f388ba93-d43b-4a69-9a4f-34805f2b708b','1c32cc39-1e93-4edb-af20-2cf0473d0d3c'),
 ('4c713510-84b0-4336-9a23-b51e3dd2f89b','3371c22e-da78-486a-8e89-d6e4270e4138'),
 ('e86474d4-feec-4401-a824-a4285d05d5c7','77def188-4620-422f-b9a0-681ad97c23d6'),
 ('f4280136-e1f7-4b0d-a728-73af87b89d8f','77def188-4620-422f-b9a0-681ad97c23d6'),
 ('46a9ca45-4c80-405c-9b88-7b8b0109be59','77def188-4620-422f-b9a0-681ad97c23d6'),
 ('6b47d394-15fb-4cb6-89ba-49e49483baf7','237f54f6-f27c-4a81-97b8-da8786f412cc'),
 ('ebbb173a-cb84-45fd-a61f-d23ad47fafe7','237f54f6-f27c-4a81-97b8-da8786f412cc'),
 ('a1af0f93-6e3f-4022-b41f-7e033a7e223a','237f54f6-f27c-4a81-97b8-da8786f412cc'),
 ('4a9a4330-c1c9-419b-af48-fd23d04fa340','237f54f6-f27c-4a81-97b8-da8786f412cc'),
 ('0608d047-a128-49ed-a048-bf2865ddee2c','19153fec-8f84-4372-ad8c-4e8a57dd9417'),
 ('1588057e-d921-4494-9be8-0ac3512b156f','629cc781-5fb5-4ab5-b6de-4dd968a4ad06'),
 ('53764a6b-29b7-4a98-9b42-85f9685a95ae','0492c23b-89d8-441c-9c17-63a914839a15'),
 ('e4832111-f821-44d2-8987-89a561dfdcbb','0492c23b-89d8-441c-9c17-63a914839a15'),
 ('73358ade-446f-4c4e-8b39-74b6f99b531a','0492c23b-89d8-441c-9c17-63a914839a15');
-- Refuse to merge an unrelated task if identity has changed since the split.
do $$ begin
 if exists(select 1 from collapsed_tasks m join public.tasks c on c.id=m.child left join public.tasks p on p.id=m.survivor
 where p.id is null or c.deliverable_definition_id is null or
 (c.organization_id,c.project_id,c.deliverable_definition_id,c.contract_start,c.contract_end)
 is distinct from (p.organization_id,p.project_id,p.deliverable_definition_id,p.contract_start,p.contract_end))
 then raise exception 'Split task identity changed; cleanup stopped'; end if;
end $$;
alter table public.tasks disable trigger guard_delivery_task;
alter table public.tasks disable trigger log_change;
alter table public.tasks disable trigger record_task_status;
alter table public.comments disable trigger guard_record;
alter table public.comments disable trigger log_change;
alter table public.comments disable trigger touch_updated_at;
-- Preserve full split snapshots, including status, edits and assignment provenance.
insert into public.activity_logs(organization_id,entity_type,entity_id,action,metadata)
 select c.organization_id,'task',m.survivor,'updated',jsonb_build_object('collapsed_task',to_jsonb(c),'assignments',coalesce((select jsonb_agg(a) from public.task_assignees a where a.task_id=c.id),'[]'::jsonb))
 from collapsed_tasks m join public.tasks c on c.id=m.child;
update public.activity_logs h set entity_id=m.survivor,metadata=h.metadata||jsonb_build_object('original_task_id',m.child)
 from collapsed_tasks m where h.entity_type='task' and h.entity_id=m.child;
update public.comments c set task_id=m.survivor from collapsed_tasks m where c.task_id=m.child;
insert into public.task_assignees(organization_id,task_id,user_id)
 select a.organization_id,m.survivor,a.user_id from public.task_assignees a join collapsed_tasks m on m.child=a.task_id
 on conflict(task_id,user_id) do nothing;
-- Aggregate snapshots before deleting the extra rows; never discard delivered quantity.
create temporary table restored_contracts on commit drop as
 select p.id,sum(t.target_min)::integer lo,sum(t.target_max)::integer hi,sum(t.completed_quantity)::integer delivered,
 case when bool_or(t.status='review') then 'review'::public.task_status
 when bool_or(t.status='in_progress') then 'in_progress'::public.task_status
 when bool_and(t.status='done') then 'done'::public.task_status
 when bool_and(t.status='cancelled') then 'cancelled'::public.task_status
 when sum(t.completed_quantity)>0 or bool_or(t.status='done') then 'in_progress'::public.task_status else p.status end status
 from public.tasks p join (select distinct survivor from collapsed_tasks m where exists(select 1 from public.tasks c where c.id=m.child)) g on g.survivor=p.id
 join public.tasks t on t.id=p.id or t.id in(select child from collapsed_tasks where survivor=p.id)
 group by p.id;
delete from public.tasks t using collapsed_tasks m where t.id=m.child;
update public.tasks t set period_start=contract_start,period_end=contract_end,due_date=case when due_date=period_end then contract_end else due_date end,
 target_min=r.lo,target_max=r.hi,completed_quantity=r.delivered,status=r.status
 from restored_contracts r where t.id=r.id;
alter table public.tasks enable trigger guard_delivery_task;
alter table public.tasks enable trigger log_change;
alter table public.tasks enable trigger record_task_status;
alter table public.comments enable trigger guard_record;
alter table public.comments enable trigger log_change;
alter table public.comments enable trigger touch_updated_at;
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
 if new.contract_start<>date_trunc('week',(now() at time zone 'Africa/Johannesburg'))::date or new.contract_end<>new.contract_start+6 then raise exception 'Current actionable contract week required' using errcode='22023'; end if;
 end if;
 if new.period_start is distinct from new.contract_start or new.period_end is distinct from new.contract_end or new.target_min is distinct from definition.target_min or new.target_max is distinct from definition.target_max or new.target_unit is distinct from definition.unit then raise exception 'One full contractual occurrence required' using errcode='23514'; end if;
 end if;
 if tg_op='UPDATE' and new.completed_quantity is distinct from old.completed_quantity then
 new.status=case when new.completed_quantity>=new.target_min then 'done'::public.task_status when new.completed_quantity>0 then 'in_progress'::public.task_status else 'todo'::public.task_status end;
 end if;
 if new.status='done' and new.completed_quantity<new.target_min then raise exception 'Record the delivered quantity before completing this deliverable' using errcode='23514'; end if;
 return new;
end $$;

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
 insert into public.task_assignees(organization_id,task_id,user_id) select organization_id,child,user_id from public.task_assignees where task_id=root.id on conflict(task_id,user_id) do nothing;
 end if;
 end loop;
 end loop;
 return inserted;
end $$;
commit;
