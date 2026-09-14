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

do $$ declare anchor date=date_trunc('month',now() at time zone 'Africa/Johannesburg')::date; root uuid; n int; before_count int; begin
 root=public.save_task('20000000-0000-4000-8000-000000000001',null,'Monthly anchor','Test','todo','medium',anchor-1,null,null,'{}','monthly',anchor-1,null);
 select count(*) into n from public.tasks where recurrence_parent_id=root;
 if n<>1 then raise exception 'Monthly manual occurrence missing'; end if;
 if exists(select 1 from public.tasks where recurrence_parent_id=root and (period_start<>anchor or period_end<>(anchor+interval '1 month - 1 day')::date)) then raise exception 'Monthly work period invalid'; end if;
 root=public.save_task('20000000-0000-4000-8000-000000000001',null,'Changing cadence','Test','todo','medium',anchor,null,null,'{}','weekly',anchor,null);
 select count(*) into before_count from public.tasks where recurrence_parent_id=root;
 update public.tasks set recurrence_type='biweekly' where id=root;
 perform public.generate_current_deliverables('20000000-0000-4000-8000-000000000001');
 select count(*) into n from public.tasks where recurrence_parent_id=root;
 if n<>before_count then raise exception 'Cadence edit duplicated existing work'; end if;
 update public.tasks set recurrence_type='none' where id=root;
 if public.generate_current_deliverables('20000000-0000-4000-8000-000000000001')<>0 then raise exception 'Stopped recurrence generated work'; end if;
end $$;
rollback;
