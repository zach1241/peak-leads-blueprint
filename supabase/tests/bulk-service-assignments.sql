-- Pure SQL: run as postgres after the migrations on a disposable database, or
-- in an explicitly authorized hosted rollback preview. Every fixture rolls back.
begin;
create temporary table bulk_test_results(message text primary key, passed boolean not null) on commit drop;
create temporary table bulk_test_ids(name text primary key, id uuid not null) on commit drop;
grant select, insert on bulk_test_results, bulk_test_ids to authenticated;
create function pg_temp.check(ok boolean, message text) returns text language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  insert into bulk_test_results values(message, true);
  return 'PASS: ' || message;
end $$;
create function pg_temp.reject(command text, expected text, message text) returns text language plpgsql as $$
declare actual text;
begin
  begin execute command; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  return pg_temp.check(actual = expected, message || coalesce(' (SQLSTATE ' || actual || ')', ' (no error)'));
end $$;
create function pg_temp.task(project uuid, deliverable text) returns uuid language sql as $$
  select t.id from public.tasks t join public.service_deliverables d on d.id = t.deliverable_definition_id
    where t.project_id = project and d.code = deliverable limit 1;
$$;

insert into auth.users(id, email, raw_user_meta_data) values
  ('81000000-0000-4000-8000-000000000001', 'bulk-owner@example.test', '{}'),
  ('81000000-0000-4000-8000-000000000002', 'bulk-admin@example.test', '{}'),
  ('81000000-0000-4000-8000-000000000003', 'bulk-member@example.test', '{}'),
  ('81000000-0000-4000-8000-000000000004', 'bulk-outsider@example.test', '{}');
insert into public.organizations(id, name, slug) values
  ('82000000-0000-4000-8000-000000000001', 'Bulk test A', 'bulk-test-a'),
  ('82000000-0000-4000-8000-000000000002', 'Bulk test B', 'bulk-test-b');
insert into public.organization_members(organization_id, user_id, role) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'owner'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'admin'),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'member'),
  ('82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000004', 'owner');
insert into public.projects(id, organization_id, name, created_by) values
  ('85000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000002', 'Foreign project', '81000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
insert into public.service_templates(id, organization_id, code, name) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'seo', 'SEO'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'lsa', 'LSA');
-- Four hundred deliverables prove the action is independent of a 25-row Tasks page.
insert into public.service_deliverables(id, organization_id, service_template_id, code, name, cadence, target_min, target_max, unit)
  select ('84000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
    'seo-' || n, 'SEO work ' || n, case when n = 400 then 'weekly' else 'monthly' end, 1, 1, 'report'
  from generate_series(1, 400) n;
insert into public.service_deliverables(id, organization_id, service_template_id, code, name, cadence, target_min, target_max, unit) values
  ('84000000-0000-4000-8000-000000000401', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', 'lsa-1', 'LSA review', 'monthly', 1, 1, 'report'),
  ('84000000-0000-4000-8000-000000000402', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', 'lsa-2', 'LSA optimization', 'monthly', 1, 1, 'report');
insert into public.clients(id, organization_id, name, slug) values
  ('87000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Client A', 'bulk-client-a'),
  ('87000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'Client B', 'bulk-client-b');
insert into public.projects(id, organization_id, name, status, service_template_id, client_id, created_by) values
  ('85000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', 'Client A SEO', 'active', '83000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001', auth.uid()),
  ('85000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', 'Client A LSA', 'active', '83000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000001', auth.uid()),
  ('85000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', 'Client B SEO', 'active', '83000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000002', auth.uid()),
  ('85000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', 'Client B custom service', 'active', null, '87000000-0000-4000-8000-000000000002', auth.uid());
select pg_temp.check(public.generate_current_deliverables('82000000-0000-4000-8000-000000000001') = 802, 'generate eight hundred and two occurrences across three client services');
select pg_temp.check((select eligible_tasks from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where project_id = '85000000-0000-4000-8000-000000000001') = 400, 'options report all four hundred SEO tasks beyond page size');
select pg_temp.check((select count(*) from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where not default_configured and cardinality(default_assignees) = 0) = 4, 'no service defaults are guessed on installation');

-- Seed a deliverable override, then bulk future scope must replace it.
select public.set_task_assignees('82000000-0000-4000-8000-000000000001', pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-1'), array['81000000-0000-4000-8000-000000000001']::uuid[], true);
create temporary table bulk_task_snapshots on commit drop as
  select t.id, to_jsonb(t) value from public.tasks t where t.organization_id = '82000000-0000-4000-8000-000000000001';
grant select on bulk_task_snapshots to authenticated;
select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002']::uuid[], array['81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003']::uuid[], true) = 402, 'one save assigns two services and four hundred and two current tasks');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id where t.project_id in ('85000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000002')) = 804, 'every selected task receives both chosen teammates');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id where t.project_id = '85000000-0000-4000-8000-000000000003') = 0, 'other client sharing the SEO template stays unchanged');
select pg_temp.check(not exists(select 1 from public.tasks t join bulk_task_snapshots s on s.id = t.id where to_jsonb(t) is distinct from s.value), 'assignment save does not modify task fields or historical snapshots');
select pg_temp.check((select count(*) from public.service_assignment_members where organization_id = '82000000-0000-4000-8000-000000000001') = 4, 'group defaults saved independently for each client service');
select pg_temp.check((select count(*) from public.recurring_assignment_members m join public.recurring_assignment_rules r on r.id = m.rule_id where r.project_id = '85000000-0000-4000-8000-000000000001' and r.deliverable_definition_id = '84000000-0000-4000-8000-000000000001') = 2, 'bulk future save replaces an existing deliverable override');
select pg_temp.check((select default_configured and default_assignees = array['81000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003']::uuid[] from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where project_id = '85000000-0000-4000-8000-000000000001'), 'options return saved group with deterministic order');

select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000001']::uuid[], array['81000000-0000-4000-8000-000000000001']::uuid[], false) = 400, 'temporary bulk scope assigns all four hundred SEO tasks');
select pg_temp.check((select count(*) from public.service_assignment_members where project_id = '85000000-0000-4000-8000-000000000001') = 2, 'temporary bulk edit preserves saved service group');
select pg_temp.check((select count(*) from public.recurring_assignment_members m join public.recurring_assignment_rules r on r.id = m.rule_id where r.project_id = '85000000-0000-4000-8000-000000000001') = 800, 'temporary bulk edit preserves deliverable defaults');
delete from public.tasks where id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-400');
-- Simulate missing fixture data for inheritance, not a user-requested deletion.
-- Clear only this synthetic organization's markers inside the rollback test.
reset role;
delete from private.deleted_task_occurrences
  where organization_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check(public.generate_current_deliverables('82000000-0000-4000-8000-000000000001') = 1, 'only missing weekly occurrence regenerates');
select pg_temp.check((select count(*) from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-400')) = 2, 'weekly generation inherits persistent group after temporary edit');

-- A newly added deliverable has no series rule and must inherit project fallback.
insert into public.service_deliverables(id, organization_id, service_template_id, code, name, cadence, target_min, target_max, unit) values
  ('84000000-0000-4000-8000-000000000403', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'seo-new', 'New SEO deliverable', 'monthly', 1, 1, 'report');
select pg_temp.check(public.generate_current_deliverables('82000000-0000-4000-8000-000000000001') = 2, 'new deliverable generates independently for two clients');
select pg_temp.check((select count(*) from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new')) = 2, 'unseen deliverable inherits project fallback');
select pg_temp.check((select count(*) from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000003', 'seo-new')) = 0, 'unseen deliverable does not copy another client default');
select public.set_task_assignees('82000000-0000-4000-8000-000000000001', pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new'), '{}'::uuid[], true);
delete from public.tasks where id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new');
-- Simulate missing fixture data for inheritance, not a user-requested deletion.
-- Clear only this synthetic organization's markers inside the rollback test.
reset role;
delete from private.deleted_task_occurrences
  where organization_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.generate_current_deliverables('82000000-0000-4000-8000-000000000001');
select pg_temp.check((select count(*) from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new')) = 0, 'explicit empty deliverable override wins over service fallback');
select public.set_task_assignees('82000000-0000-4000-8000-000000000001', pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new'), array['81000000-0000-4000-8000-000000000001']::uuid[], true);
delete from public.tasks where id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new');
-- Simulate missing fixture data for inheritance, not a user-requested deletion.
-- Clear only this synthetic organization's markers inside the rollback test.
reset role;
delete from private.deleted_task_occurrences
  where organization_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.generate_current_deliverables('82000000-0000-4000-8000-000000000001');
select pg_temp.check((select user_id from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-new')) = '81000000-0000-4000-8000-000000000001'::uuid, 'single-member individual override wins over service group');

-- Generic projects and manual roots are eligible too. Root is truly historical.
select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000004']::uuid[], array['81000000-0000-4000-8000-000000000003']::uuid[], true) = 0, 'service default can be configured before any tasks exist');
select pg_temp.check((select default_configured and default_assignees = array['81000000-0000-4000-8000-000000000003']::uuid[] from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where project_id = '85000000-0000-4000-8000-000000000004'), 'zero-task project reports saved future default');
insert into bulk_test_ids values('manual-root', public.save_task('82000000-0000-4000-8000-000000000001', null, 'Manual recurring work', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', array['81000000-0000-4000-8000-000000000001']::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, true));
insert into public.tasks(id, organization_id, project_id, client_id, title, status, due_date, period_start, period_end, created_by) values
  ('86000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Historical period', 'todo', null, (now() at time zone 'Africa/Johannesburg')::date - 20, (now() at time zone 'Africa/Johannesburg')::date - 1, auth.uid()),
  ('86000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Completed work', 'done', null, null, null, auth.uid()),
  ('86000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Cancelled work', 'cancelled', null, null, null, auth.uid()),
  ('86000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Overdue one-off', 'todo', (now() at time zone 'Africa/Johannesburg')::date - 10, null, null, auth.uid()),
  ('86000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Upcoming period', 'backlog', null, (now() at time zone 'Africa/Johannesburg')::date + 2, (now() at time zone 'Africa/Johannesburg')::date + 9, auth.uid());
insert into public.task_assignees(organization_id, task_id, user_id)
  select organization_id, id, '81000000-0000-4000-8000-000000000001' from public.tasks
  where id in ('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000003');
select pg_temp.check((select eligible_tasks from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where project_id = '85000000-0000-4000-8000-000000000004') = 3, 'options exclude history done and cancelled but include overdue one-off and upcoming work');
select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000004','85000000-0000-4000-8000-000000000002']::uuid[], array['81000000-0000-4000-8000-000000000003']::uuid[], true) = 5, 'one operation handles multiple clients and generic projects');
select pg_temp.check((select count(*) from public.task_assignees where task_id in ('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','86000000-0000-4000-8000-000000000003') and user_id = '81000000-0000-4000-8000-000000000001') = 3, 'historical completed and cancelled assignments preserved');
select pg_temp.check((select user_id from public.task_assignees where task_id = (select id from bulk_test_ids where name = 'manual-root')) = '81000000-0000-4000-8000-000000000001'::uuid, 'historical manual root assignment preserved');
delete from public.tasks where recurrence_parent_id = (select id from bulk_test_ids where name = 'manual-root');
-- Simulate missing fixture data for inheritance, not a user-requested deletion.
-- Clear only this synthetic organization's markers inside the rollback test.
reset role;
delete from private.deleted_task_occurrences
  where organization_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.generate_current_deliverables('82000000-0000-4000-8000-000000000001');
select pg_temp.check((select a.user_id from public.task_assignees a join public.tasks t on t.id = a.task_id where t.recurrence_parent_id = (select id from bulk_test_ids where name = 'manual-root')) = '81000000-0000-4000-8000-000000000003'::uuid, 'manual child inherits bulk future default after existing root rule reset');

-- A legacy manual root with no rule proves project fallback beats old root data.
insert into public.tasks(id, organization_id, project_id, client_id, title, recurrence_type, recurrence_start, due_date, created_by) values
  ('86000000-0000-4000-8000-000000000006', '82000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', 'Legacy root', 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, auth.uid());
select public.set_task_assignees('82000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000006', array['81000000-0000-4000-8000-000000000001']::uuid[], false);
select public.generate_current_deliverables('82000000-0000-4000-8000-000000000001');
select pg_temp.check((select a.user_id from public.task_assignees a join public.tasks t on t.id = a.task_id where t.recurrence_parent_id = '86000000-0000-4000-8000-000000000006') = '81000000-0000-4000-8000-000000000003'::uuid, 'project fallback wins over legacy manual root assignments');
insert into bulk_test_ids values('explicit-manual', public.save_task('82000000-0000-4000-8000-000000000001', null, 'Explicit new manual work', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', array['81000000-0000-4000-8000-000000000002']::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, false));
select pg_temp.check((select a.user_id from public.task_assignees a join public.tasks t on t.id = a.task_id where t.recurrence_parent_id = (select id from bulk_test_ids where name = 'explicit-manual')) = '81000000-0000-4000-8000-000000000002'::uuid, 'new manual recurrence retains explicitly selected initial assignee');
insert into bulk_test_ids values('inherited-manual', public.save_task('82000000-0000-4000-8000-000000000001', null, 'Inherit service team through task form', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', '{}'::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, false));
select pg_temp.check((select user_id from public.task_assignees where task_id = (select id from bulk_test_ids where name = 'inherited-manual')) = '81000000-0000-4000-8000-000000000003'::uuid, 'normal form empty initial selection inherits project team on new manual root');
select pg_temp.check((select a.user_id from public.task_assignees a join public.tasks t on t.id = a.task_id where t.recurrence_parent_id = (select id from bulk_test_ids where name = 'inherited-manual')) = '81000000-0000-4000-8000-000000000003'::uuid, 'normal form creates manual children with inherited persistent team');
insert into bulk_test_ids values('empty-manual', public.save_task('82000000-0000-4000-8000-000000000001', null, 'Explicit future unassignment through task form', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, '85000000-0000-4000-8000-000000000004', '87000000-0000-4000-8000-000000000002', '{}'::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, true));
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id where t.id = (select id from bulk_test_ids where name = 'empty-manual') or t.recurrence_parent_id = (select id from bulk_test_ids where name = 'empty-manual')) = 0, 'explicit empty future scope keeps manual root and children unassigned');

-- Invalid input must leave all selected services unchanged in the same transaction.
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'',''85000000-0000-4000-8000-000000000005'']::uuid[],''{}''::uuid[],true)', '42501', 'mixed tenant project selection is rejected atomically');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],array[''81000000-0000-4000-8000-000000000004'']::uuid[],true)', '23503', 'foreign workspace teammate is rejected atomically');
select pg_temp.check((select count(*) from public.service_assignment_members where project_id = '85000000-0000-4000-8000-000000000001') = 2, 'failed writes leave service defaults unchanged');
select pg_temp.check((select user_id from public.task_assignees where task_id = pg_temp.task('85000000-0000-4000-8000-000000000001', 'seo-1')) = '81000000-0000-4000-8000-000000000001'::uuid, 'failed writes leave current assignments unchanged');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',''{}''::uuid[],''{}''::uuid[],true)', '22023', 'empty project list rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[null]::uuid[],''{}''::uuid[],true)', '22023', 'null project element rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',null,''{}''::uuid[],true)', '22023', 'null project list rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],array[null]::uuid[],true)', '22023', 'null teammate element rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],null,true)', '22023', 'null teammate list rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[],null)', '22023', 'null assignment scope rejected');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array_fill(''85000000-0000-4000-8000-000000000001''::uuid,array[1001]),''{}''::uuid[],true)', '22023', 'project selection bound enforced');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],array_fill(''81000000-0000-4000-8000-000000000001''::uuid,array[101]),true)', '22023', 'teammate selection bound enforced');
select pg_temp.reject('delete from public.service_assignment_rules', '42501', 'direct rule deletes cannot bypass validated helper');
select pg_temp.reject('insert into public.service_assignment_members values(''82000000-0000-4000-8000-000000000001'',''85000000-0000-4000-8000-000000000001'',''81000000-0000-4000-8000-000000000001'')', '42501', 'direct default membership writes forbidden');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000003', true);
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[],true)', '42501', 'ordinary member cannot change bulk assignments');
select pg_temp.reject('select private.save_service_assignment_defaults(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[])', '42501', 'ordinary member cannot call helper to bypass role checks');
select pg_temp.check((select count(*) from public.service_assignment_options('82000000-0000-4000-8000-000000000001')) = 4, 'workspace member can read tenant scoped options');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000004', true);
select pg_temp.check((select count(*) from public.service_assignment_rules where organization_id = '82000000-0000-4000-8000-000000000001') = 0, 'outsider cannot read another workspace rules');
select pg_temp.check((select count(*) from public.service_assignment_members where organization_id = '82000000-0000-4000-8000-000000000001') = 0, 'outsider cannot read another workspace default assignees');
select pg_temp.reject('select public.service_assignment_options(''82000000-0000-4000-8000-000000000001'')', '42501', 'outsider cannot get another workspace option counts');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[],true)', '42501', 'outsider cannot mutate another workspace');
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[],true)', '42501', 'authenticated role with no user identity rejected');

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000002']::uuid[], array['81000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000003']::uuid[], false) = 2, 'admin may assign and duplicate IDs do not multiply task count');
select pg_temp.check(public.set_service_assignees('82000000-0000-4000-8000-000000000001', array['85000000-0000-4000-8000-000000000002']::uuid[], '{}'::uuid[], true) = 2, 'clear saves empty future default and unassigns current LSA tasks');
select pg_temp.check((select default_configured and cardinality(default_assignees) = 0 from public.service_assignment_options('82000000-0000-4000-8000-000000000001') where project_id = '85000000-0000-4000-8000-000000000002'), 'options distinguish deliberate unassignment from absent default');
delete from public.tasks where id = pg_temp.task('85000000-0000-4000-8000-000000000002', 'lsa-1');
-- Simulate missing fixture data for inheritance, not a user-requested deletion.
-- Clear only this synthetic organization's markers inside the rollback test.
reset role;
delete from private.deleted_task_occurrences
  where organization_id = '82000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.generate_current_deliverables('82000000-0000-4000-8000-000000000001');
select pg_temp.check((select count(*) from public.task_assignees a join public.tasks t on t.id = a.task_id where t.project_id = '85000000-0000-4000-8000-000000000002') = 0, 'cleared service stays unassigned after monthly generation');
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000001', true);
delete from public.organization_members where organization_id = '82000000-0000-4000-8000-000000000001' and user_id = '81000000-0000-4000-8000-000000000003';
select pg_temp.check((select count(*) from public.service_assignment_members where user_id = '81000000-0000-4000-8000-000000000003') = 0, 'removed workspace member cascades out of service defaults');
reset role;
select pg_temp.reject('insert into public.service_assignment_rules values(''82000000-0000-4000-8000-000000000001'',''85000000-0000-4000-8000-000000000005'')', '23503', 'compound project foreign key rejects cross-tenant default');
select pg_temp.reject('insert into public.service_assignment_members values(''82000000-0000-4000-8000-000000000001'',''85000000-0000-4000-8000-000000000001'',''81000000-0000-4000-8000-000000000004'')', '23503', 'compound membership foreign key rejects cross-tenant teammate');
select pg_temp.check((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('service_assignment_rules','service_assignment_members') and c.relrowsecurity) = 2, 'both exposed default tables have RLS enabled');
-- pg_temp.check writes the temporary results, so grant only that test table.
grant select, insert on bulk_test_results to anon;
set local role anon;
select pg_temp.reject('select * from public.service_assignment_rules', '42501', 'anonymous caller cannot read service defaults');
select pg_temp.reject('select public.service_assignment_options(''82000000-0000-4000-8000-000000000001'')', '42501', 'anonymous caller cannot invoke option RPC');
select pg_temp.reject('select public.set_service_assignees(''82000000-0000-4000-8000-000000000001'',array[''85000000-0000-4000-8000-000000000001'']::uuid[],''{}''::uuid[],true)', '42501', 'anonymous caller cannot invoke bulk assignment RPC');
reset role;
select count(*) as passed_checks, bool_and(passed) as all_passed from bulk_test_results;
rollback;
