-- Run with psql -v ON_ERROR_STOP=1 against a disposable local database.
-- Synthetic fixtures and every mutation roll back; never uses hosted credentials.
begin;
create function pg_temp.check(ok boolean, message text) returns text language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',message; end if; return 'PASS: '||message; end $$;
create function pg_temp.reject(command text, expected text, message text) returns text language plpgsql as $$
declare actual text;
begin
 begin execute command; exception when others then get stacked diagnostics actual=returned_sqlstate; end;
 return pg_temp.check(actual=expected,message||coalesce(' (SQLSTATE '||actual||')',' (no error)'));
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('61000000-0000-4000-8000-000000000001','recurring-owner@example.test','{}'),
 ('61000000-0000-4000-8000-000000000002','recurring-member@example.test','{}'),
 ('61000000-0000-4000-8000-000000000003','recurring-outsider@example.test','{}');
insert into public.organizations(id,name,slug) values
 ('62000000-0000-4000-8000-000000000001','Recurring test A','recurring-test-a'),
 ('62000000-0000-4000-8000-000000000002','Recurring test B','recurring-test-b');
insert into public.organization_members(organization_id,user_id,role) values
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','owner'),
 ('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','member'),
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000003','owner');
set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
insert into public.service_templates(id,organization_id,code,name) values ('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','seo','SEO');
insert into public.service_deliverables(id,organization_id,service_template_id,code,name,cadence,target_min,target_max,unit) values
 ('64000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','seo-monthly','SEO monthly','monthly',1,1,'report'),
 ('64000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','seo-weekly','SEO weekly','weekly',1,1,'report');
insert into public.clients(id,organization_id,name,slug) values
 ('67000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Client A','recurring-client-a'),
 ('67000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','Client B','recurring-client-b');
insert into public.projects(id,organization_id,name,status,service_template_id,created_by,client_id) values
 ('65000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','Client A SEO','active','63000000-0000-4000-8000-000000000001',auth.uid(),'67000000-0000-4000-8000-000000000001'),
 ('65000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','Client B SEO','active','63000000-0000-4000-8000-000000000001',auth.uid(),'67000000-0000-4000-8000-000000000002');
select pg_temp.check(public.generate_current_deliverables('62000000-0000-4000-8000-000000000001')=4,'generator creates the expected four service occurrences');
select id as monthly_id from public.tasks where project_id='65000000-0000-4000-8000-000000000001' and deliverable_definition_id='64000000-0000-4000-8000-000000000001' \gset
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'monthly_id',array['61000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002']::uuid[],true);
select pg_temp.check((select count(*) from public.task_assignees where task_id=:'monthly_id')=2,'group assignment updates the current task');
select pg_temp.check((select count(*) from public.recurring_assignment_members)=2,'group assignment saves both members for the series');
select pg_temp.check((select count(*) from public.recurring_assignment_rules)=1,'other client and deliverable series stay independent');
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'monthly_id',array['61000000-0000-4000-8000-000000000001']::uuid[],false);
select pg_temp.check((select count(*) from public.recurring_assignment_members)=2,'one-off reassignment preserves the future group');
select pg_temp.reject(format('select public.set_task_assignees(%L,%L,array[%L]::uuid[],true)','62000000-0000-4000-8000-000000000001',:'monthly_id','61000000-0000-4000-8000-000000000003'),'23503','foreign workspace assignee rejected');
select pg_temp.check((select count(*) from public.task_assignees where task_id=:'monthly_id')=1,'failed reassignment rolls back current assignment changes');
select pg_temp.check((select count(*) from public.recurring_assignment_members)=2,'failed reassignment preserves future defaults');
select pg_temp.reject('delete from public.recurring_assignment_members','42501','direct API writes cannot bypass the validated RPC');
select pg_temp.reject(format('select public.set_task_assignees(%L,%L,''{}''::uuid[],true)','62000000-0000-4000-8000-000000000002',:'monthly_id'),'42501','cross-workspace task rejected');
-- Regenerate the occurrence after removing its predecessor. Defaults must persist
-- independently of a task's lifespan; this exercises the production generator.
delete from public.tasks where id=:'monthly_id';
select pg_temp.check(public.generate_current_deliverables('62000000-0000-4000-8000-000000000001')=1,'only the missing occurrence is generated');
select id as monthly_id from public.tasks where project_id='65000000-0000-4000-8000-000000000001' and deliverable_definition_id='64000000-0000-4000-8000-000000000001' \gset
select pg_temp.check((select count(*) from public.task_assignees where task_id=:'monthly_id')=2,'new monthly occurrence inherits the saved group');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id=a.task_id where t.project_id='65000000-0000-4000-8000-000000000002')=0,'another client using the same SEO template remains unassigned');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id=a.task_id where t.deliverable_definition_id='64000000-0000-4000-8000-000000000002')=0,'another deliverable remains unassigned');
select pg_temp.check(public.generate_current_deliverables('62000000-0000-4000-8000-000000000001')=0,'generation stays idempotent');
select id as weekly_id from public.tasks where project_id='65000000-0000-4000-8000-000000000001' and deliverable_definition_id='64000000-0000-4000-8000-000000000002' \gset
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'weekly_id',array['61000000-0000-4000-8000-000000000001']::uuid[],true);
delete from public.tasks where id=:'weekly_id';
select public.generate_current_deliverables('62000000-0000-4000-8000-000000000001');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id=a.task_id where t.project_id='65000000-0000-4000-8000-000000000001' and t.deliverable_definition_id='64000000-0000-4000-8000-000000000002')=1,'weekly service occurrence inherits individual assignment');
select id as weekly_id from public.tasks where project_id='65000000-0000-4000-8000-000000000001' and deliverable_definition_id='64000000-0000-4000-8000-000000000002' \gset
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'weekly_id','{}'::uuid[],true);
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'monthly_id','{}'::uuid[],true);
delete from public.tasks where id=:'monthly_id';
select public.generate_current_deliverables('62000000-0000-4000-8000-000000000001');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id=a.task_id where t.project_id='65000000-0000-4000-8000-000000000001')=0,'clearing future assignments keeps new occurrences unassigned');
-- Manual recurrence: the original is a genuine prior-month task, and generation
-- creates this month's child using the repository's current-period calculation.
select public.save_task('62000000-0000-4000-8000-000000000001',null,'Manual SEO',null,'todo','medium',(date_trunc('month',now() at time zone 'Africa/Johannesburg')-interval '1 month')::date,null,null,array['61000000-0000-4000-8000-000000000001']::uuid[],'monthly',(date_trunc('month',now() at time zone 'Africa/Johannesburg')-interval '1 month')::date,null,true) as source_id \gset
select id as child_id from public.tasks where recurrence_parent_id=:'source_id' \gset
select pg_temp.check((select count(*) from public.task_assignees where task_id=:'child_id')=1,'manual monthly child inherits the individual assignee');
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'child_id',array['61000000-0000-4000-8000-000000000002']::uuid[],true);
select pg_temp.check((select user_id from public.task_assignees where task_id=:'source_id')='61000000-0000-4000-8000-000000000001'::uuid,'changing future defaults from a child preserves historical source assignment');
delete from public.tasks where id=:'child_id';
select public.generate_current_deliverables('62000000-0000-4000-8000-000000000001');
select pg_temp.check((select a.user_id from public.task_assignees a join public.tasks t on t.id=a.task_id where t.recurrence_parent_id=:'source_id')='61000000-0000-4000-8000-000000000002'::uuid,'new manual occurrence uses changed series default');
-- New repeating sources capture initial defaults even through the legacy save API.
select public.save_task('62000000-0000-4000-8000-000000000001',null,'Legacy monthly',null,'todo','medium',(date_trunc('month',now() at time zone 'Africa/Johannesburg')-interval '1 month')::date,null,null,array['61000000-0000-4000-8000-000000000001']::uuid[],'monthly',(date_trunc('month',now() at time zone 'Africa/Johannesburg')-interval '1 month')::date,null) as legacy_id \gset
select pg_temp.check((select count(*) from public.recurring_assignment_rules where source_task_id=:'legacy_id')=1,'legacy save initializes defaults for newly repeating task');
select public.set_task_assignees('62000000-0000-4000-8000-000000000001',:'legacy_id','{}'::uuid[]);
select pg_temp.check((select count(*) from public.recurring_assignment_members m join public.recurring_assignment_rules r on r.id=m.rule_id where r.source_task_id=:'legacy_id')=1,'legacy one-off RPC leaves future defaults unchanged');
select public.save_task('62000000-0000-4000-8000-000000000001',null,'One-off SEO',null,'todo','medium',null,null,null,array['61000000-0000-4000-8000-000000000001']::uuid[]) as oneoff_id \gset
select pg_temp.reject(format('select public.set_task_assignees(%L,%L,array[%L]::uuid[],true)','62000000-0000-4000-8000-000000000001',:'oneoff_id','61000000-0000-4000-8000-000000000002'),'22023','future scope on a non-repeating task is rejected');
select pg_temp.check((select user_id from public.task_assignees where task_id=:'oneoff_id')='61000000-0000-4000-8000-000000000001'::uuid,'invalid future scope rolls back the current assignment');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select pg_temp.reject(format('select public.set_task_assignees(%L,%L,''{}''::uuid[],true)','62000000-0000-4000-8000-000000000001',:'source_id'),'42501','ordinary member cannot change recurring assignments');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000003',true);
select pg_temp.check((select count(*) from public.recurring_assignment_rules where organization_id='62000000-0000-4000-8000-000000000001')=0,'outsider cannot read another workspace defaults');
select pg_temp.check((select count(*) from public.recurring_assignment_members where organization_id='62000000-0000-4000-8000-000000000001')=0,'outsider cannot read another workspace saved assignees');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
-- Membership cascade must affect future defaults as well as task assignments.
delete from public.organization_members where organization_id='62000000-0000-4000-8000-000000000001' and user_id='61000000-0000-4000-8000-000000000002';
select pg_temp.check((select count(*) from public.recurring_assignment_members where user_id='61000000-0000-4000-8000-000000000002')=0,'removed member is removed from future defaults');
reset role;
set local role anon;
select pg_temp.reject('select * from public.recurring_assignment_rules','42501','anonymous caller cannot read assignment rules');
select pg_temp.reject('select public.set_task_assignees(''62000000-0000-4000-8000-000000000001'',''66000000-0000-4000-8000-000000000001'',''{}''::uuid[],true)','42501','anonymous caller cannot execute recurring assignment mutation');
reset role;
rollback;
