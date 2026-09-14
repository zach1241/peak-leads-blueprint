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
do $$ declare c int; lo int; hi int; task uuid; root uuid; anchor date=date_trunc('month',now() at time zone 'Africa/Johannesburg')::date; last_day date; n int; begin
 last_day=(anchor+interval '1 month - 1 day')::date;
 -- Allocation conserves ranges for short/long months and both operating cadences.
 for n in 1..12 loop
 select sum(quantity_min),sum(quantity_max) into lo,hi from public.delivery_slots(make_date(2024,n,1),(make_date(2024,n,1)+interval '1 month - 1 day')::date,'weekly',6,6);
 if lo<>6 or hi<>6 then raise exception 'Weekly allocation changed monthly quantity'; end if;
 select sum(quantity_min),sum(quantity_max) into lo,hi from public.delivery_slots(make_date(2024,n,1),(make_date(2024,n,1)+interval '1 month - 1 day')::date,'biweekly',2,3);
 if lo<>2 or hi<>3 then raise exception 'Biweekly range not conserved'; end if;
 end loop;
 perform public.generate_current_deliverables('20000000-0000-4000-8000-000000000001');
 select sum(target_min),sum(target_max),count(*) into lo,hi,c from public.tasks where deliverable_definition_id='33000000-0000-4000-8000-000000000001';
 if lo<>4 or hi<>4 or c<>4 then raise exception 'Blog task distribution failed'; end if;
 select sum(target_min),sum(target_max),count(*) into lo,hi,c from public.tasks where deliverable_definition_id='33000000-0000-4000-8000-000000000002';
 if lo<>2 or hi<>3 or c<>2 then raise exception 'Backlink task distribution failed'; end if;
 if public.generate_current_deliverables('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Generated duplicates'; end if;
 select id into task from public.tasks where deliverable_definition_id='33000000-0000-4000-8000-000000000001' order by period_start limit 1;
 update public.tasks set status='done',completed_quantity=target_min where id=task;
 if not exists(select 1 from public.activity_logs where entity_id=task and action='completed') then raise exception 'Completion event missing'; end if;
 update public.tasks set status='review' where id=task;
 if not exists(select 1 from public.activity_logs where entity_id=task and action='status_changed' and metadata->>'previous_status'='done' and metadata->>'status'='review') then raise exception 'Reopen event missing'; end if;
 root=public.save_task('20000000-0000-4000-8000-000000000001',null,'Weekly manual','Test','todo','medium',anchor,null,null,array['10000000-0000-4000-8000-000000000002']::uuid[],'weekly',anchor,anchor+21);
 select count(*) into c from public.tasks where recurrence_parent_id=root;
 if c<>3 then raise exception 'Manual weekly generation/end bound failed: %',c; end if;
 if exists(select 1 from public.tasks t where t.recurrence_parent_id=root and not exists(select 1 from public.task_assignees a where a.task_id=t.id and a.user_id='10000000-0000-4000-8000-000000000002')) then raise exception 'Manual assignments missing'; end if;
 root=public.save_task('20000000-0000-4000-8000-000000000001',null,'Biweekly manual','Test','todo','medium',anchor,null,null,'{}','biweekly',anchor,null);
 select count(*) into c from public.tasks where recurrence_parent_id=root;
 if c<>floor((last_day-anchor)::numeric/14)::int then raise exception 'Manual biweekly generation failed'; end if;
 if public.manual_due('2024-01-31','monthly',1)<>'2024-02-29'::date or public.manual_due('2024-01-31','monthly',2)<>'2024-03-31'::date then raise exception 'Monthly anchor drift'; end if;
 if public.generate_current_deliverables('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Manual duplicate prevention failed'; end if;
end $$;
rollback;
