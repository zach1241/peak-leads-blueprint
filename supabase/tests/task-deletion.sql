-- Direct API deletion permissions and recurrence integrity. All fixtures roll back.
begin;
create temporary table deletion_test_results(message text primary key, passed boolean not null) on commit drop;
create temporary table deletion_test_ids(name text primary key, id uuid not null) on commit drop;
grant select, insert on deletion_test_results, deletion_test_ids to authenticated;
create function pg_temp.check(ok boolean, message text) returns text language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', message; end if;
  insert into deletion_test_results values(message, true);
  return 'PASS: ' || message;
end $$;
create function pg_temp.reject(command text, expected text, message text) returns text language plpgsql as $$
declare actual text;
begin
  begin execute command; exception when others then get stacked diagnostics actual = returned_sqlstate; end;
  return pg_temp.check(actual = expected, message || coalesce(' (SQLSTATE ' || actual || ')', ' (no error)'));
end $$;
insert into auth.users(id, email, raw_user_meta_data) values
  ('a1000000-0000-4000-8000-000000000001', 'deletion-owner@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000002', 'deletion-admin@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000003', 'deletion-member@example.test', '{}'),
  ('a1000000-0000-4000-8000-000000000004', 'deletion-outsider-admin@example.test', '{}');
insert into public.organizations(id, name, slug) values
  ('a2000000-0000-4000-8000-000000000001', 'Deletion test A', 'deletion-test-a'),
  ('a2000000-0000-4000-8000-000000000002', 'Deletion test B', 'deletion-test-b');
insert into public.organization_members(organization_id, user_id, role) values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'admin'),
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'member'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004', 'admin');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.tasks(id, organization_id, title, created_by) values
  ('a6000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Assigned protected work', auth.uid()),
  ('a6000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Owner deletes one-off', auth.uid()),
  ('a6000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Admin deletes one-off', auth.uid());
insert into public.task_assignees(organization_id, task_id, user_id)
  select organization_id, id, 'a1000000-0000-4000-8000-000000000003' from public.tasks
  where organization_id = 'a2000000-0000-4000-8000-000000000001';
insert into public.comments(organization_id, task_id, author_id, body) values
  ('a2000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000002', auth.uid(), 'Owner deletion fixture comment'),
  ('a2000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000003', auth.uid(), 'Admin deletion fixture comment');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
with removed as(delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000001' returning id)
  select pg_temp.check((select count(*) from removed) = 0, 'assigned ordinary member cannot delete own task');
select pg_temp.check(exists(select 1 from public.tasks where id = 'a6000000-0000-4000-8000-000000000001') and exists(select 1 from public.task_assignees where task_id = 'a6000000-0000-4000-8000-000000000001'), 'rejected member deletion preserves task and assignment');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000004', true);
with removed as(delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000001' returning id)
  select pg_temp.check((select count(*) from removed) = 0, 'admin from another workspace cannot delete task');
select set_config('request.jwt.claim.sub', '', true);
with removed as(delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000001' returning id)
  select pg_temp.check((select count(*) from removed) = 0, 'authenticated role without identity cannot delete task');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
with removed as(delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000002' returning id)
  select pg_temp.check((select count(*) from removed) = 1, 'workspace owner may delete a one-off task');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
with removed as(delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000003' returning id)
  select pg_temp.check((select count(*) from removed) = 1, 'workspace admin may delete a one-off task');
select pg_temp.check(not exists(select 1 from public.tasks where id in ('a6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003')) and not exists(select 1 from public.comments where task_id in ('a6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003')) and not exists(select 1 from public.task_assignees where task_id in ('a6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003')), 'owner and admin deletions cascade comments and assignments');
select pg_temp.check((select count(distinct entity_id) from public.activity_logs where entity_type = 'task' and entity_id in ('a6000000-0000-4000-8000-000000000002','a6000000-0000-4000-8000-000000000003')) = 2, 'task audit records remain after explicit task deletion');
reset role;
select pg_temp.check((select count(*) from private.deleted_task_occurrences where organization_id = 'a2000000-0000-4000-8000-000000000001') = 0, 'one-off deletions create no recurrence markers');
set local role authenticated;

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.projects(id, organization_id, name, status, created_by) values
  ('a5000000-0000-4000-8000-000000000003', 'a2000000-0000-4000-8000-000000000001', 'Original manual project', 'active', auth.uid()),
  ('a5000000-0000-4000-8000-000000000004', 'a2000000-0000-4000-8000-000000000001', 'Moved manual project', 'active', auth.uid());
insert into deletion_test_ids values('manual-root', public.save_task('a2000000-0000-4000-8000-000000000001', null, 'Protected manual series', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, 'a5000000-0000-4000-8000-000000000003', null, array['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003']::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, true));
insert into deletion_test_ids select 'manual-child', id from public.tasks where recurrence_parent_id = (select id from deletion_test_ids where name = 'manual-root');
insert into deletion_test_ids select 'manual-rule', id from public.recurring_assignment_rules where source_task_id = (select id from deletion_test_ids where name = 'manual-root');
select pg_temp.reject('delete from public.tasks where id = (select id from deletion_test_ids where name = ''manual-root'')', '23503', 'manual series source cannot be deleted while child occurrences exist');
select pg_temp.check((select count(*) from public.tasks where id in (select id from deletion_test_ids where name in ('manual-root','manual-child'))) = 2, 'restricted root deletion preserves source and child history');
delete from public.tasks where id = (select id from deletion_test_ids where name = 'manual-child');
select pg_temp.check(not exists(select 1 from public.tasks where id = (select id from deletion_test_ids where name = 'manual-child')) and exists(select 1 from public.tasks where id = (select id from deletion_test_ids where name = 'manual-root')) and (select count(*) from public.recurring_assignment_members where rule_id = (select id from deletion_test_ids where name = 'manual-rule')) = 2, 'deleting a child preserves source and saved series team');
update public.tasks set project_id = 'a5000000-0000-4000-8000-000000000004' where id = (select id from deletion_test_ids where name = 'manual-root');
delete from public.projects where id = 'a5000000-0000-4000-8000-000000000003';
reset role;
select pg_temp.check((select count(*) from private.deleted_task_occurrences where source_task_id = (select id from deletion_test_ids where name = 'manual-root')) = 1, 'moving a manual source and deleting its old project preserves period suppression');
set local role authenticated;
select pg_temp.check(public.generate_current_deliverables('a2000000-0000-4000-8000-000000000001') = 0, 'deleted manual occurrence stays deleted during automatic generation');
with inserted as(insert into public.tasks(organization_id, recurrence_parent_id, title, period_start, period_end, created_by)
  select 'a2000000-0000-4000-8000-000000000001', id, 'Deleted period duplicate', date_trunc('month',now() at time zone 'Africa/Johannesburg')::date, (date_trunc('month',now() at time zone 'Africa/Johannesburg') + interval '1 month - 1 day')::date, auth.uid() from deletion_test_ids where name = 'manual-root' returning id)
  select pg_temp.check((select count(*) from inserted) = 0, 'direct insertion also respects deleted manual period');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000003', true);
select pg_temp.reject('insert into public.tasks(organization_id,recurrence_parent_id,title,period_start,period_end,created_by) select ''a2000000-0000-4000-8000-000000000001'',id,''Forbidden deleted period insert'',date_trunc(''month'',now() at time zone ''Africa/Johannesburg'')::date,(date_trunc(''month'',now() at time zone ''Africa/Johannesburg'')+interval ''1 month - 1 day'')::date,auth.uid() from deletion_test_ids where name=''manual-root''', '42501', 'deleted-period suppression does not bypass member insert authorization');
select pg_temp.reject('select * from private.deleted_task_occurrences', '42501', 'authenticated callers cannot read private deletion markers');
select pg_temp.reject('select private.lock_task_occurrence_key(''a2000000-0000-4000-8000-000000000001'',null,null,null,current_date)', '42501', 'authenticated callers cannot execute private occurrence helper');
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);
insert into public.tasks(id, organization_id, project_id, recurrence_parent_id, title, period_start, period_end, due_date, created_by)
  select 'a6000000-0000-4000-8000-000000000006', 'a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000004', id, 'Future manual occurrence', (date_trunc('month',now() at time zone 'Africa/Johannesburg') + interval '1 month')::date, (date_trunc('month',now() at time zone 'Africa/Johannesburg') + interval '2 months - 1 day')::date, (date_trunc('month',now() at time zone 'Africa/Johannesburg') + interval '1 month')::date, auth.uid() from deletion_test_ids where name = 'manual-root';
select pg_temp.check(exists(select 1 from public.tasks where id = 'a6000000-0000-4000-8000-000000000006') and (select count(*) from public.task_assignees where task_id = 'a6000000-0000-4000-8000-000000000006') = 2, 'future manual periods remain insertable and inherit the saved team');
insert into deletion_test_ids values('other-manual-root', public.save_task('a2000000-0000-4000-8000-000000000001', null, 'Other manual series', null, 'todo', 'medium', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, null, array['a1000000-0000-4000-8000-000000000002']::uuid[], 'monthly', (date_trunc('month',now() at time zone 'Africa/Johannesburg') - interval '1 month')::date, null, true));
select pg_temp.check((select count(*) from public.tasks where recurrence_parent_id = (select id from deletion_test_ids where name = 'other-manual-root')) = 1, 'same period in another manual series is unaffected');
delete from public.tasks where id = 'a6000000-0000-4000-8000-000000000006';
reset role;
select pg_temp.check((select count(*) from private.deleted_task_occurrences where source_task_id = (select id from deletion_test_ids where name = 'manual-root') and project_id is null and deleted_by = 'a1000000-0000-4000-8000-000000000001' and deleted_at is not null) = 2, 'manual markers retain source period and deletion provenance');
set local role authenticated;
delete from public.tasks where id = (select id from deletion_test_ids where name = 'manual-root');
select pg_temp.check(not exists(select 1 from public.tasks where id = (select id from deletion_test_ids where name = 'manual-root')) and not exists(select 1 from public.recurring_assignment_rules where id = (select id from deletion_test_ids where name = 'manual-rule')) and not exists(select 1 from public.recurring_assignment_members where rule_id = (select id from deletion_test_ids where name = 'manual-rule')), 'deleting childless manual source cascades its saved default safely');
reset role;
select pg_temp.check(not exists(select 1 from private.deleted_task_occurrences where source_task_id = (select id from deletion_test_ids where name = 'manual-root')), 'manual source cleanup cascades its occurrence markers');
set local role authenticated;

insert into public.service_templates(id, organization_id, code, name) values
  ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'seo', 'SEO');
insert into public.service_deliverables(id, organization_id, service_template_id, code, name, cadence, target_min, target_max, unit) values
  ('a4000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'report', 'SEO report', 'monthly', 1, 1, 'report'),
  ('a4000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'review', 'SEO review', 'weekly', 1, 1, 'review');
insert into public.clients(id, organization_id, name, slug) values
  ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'Client A', 'deletion-client-a'),
  ('a7000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'Client B', 'deletion-client-b');
insert into public.projects(id, organization_id, client_id, service_template_id, name, status, created_by) values
  ('a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'Client A SEO', 'active', auth.uid()),
  ('a5000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000001', 'Client B SEO', 'active', auth.uid());
select public.generate_current_deliverables('a2000000-0000-4000-8000-000000000001');
select public.set_service_assignees('a2000000-0000-4000-8000-000000000001', array['a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002']::uuid[], array['a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000003']::uuid[], true);
delete from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000001' and deliverable_definition_id = 'a4000000-0000-4000-8000-000000000001';
select pg_temp.check((select count(*) from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000002') = 2 and (select count(*) from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000001') = 1 and (select count(*) from public.recurring_assignment_members m join public.recurring_assignment_rules r on r.id = m.rule_id where r.project_id in ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002')) = 8 and (select count(*) from public.service_assignment_rules where project_id in ('a5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000002')) = 2, 'occurrence deletion preserves other deliverable other client and all future teams');
select pg_temp.check(public.generate_current_deliverables('a2000000-0000-4000-8000-000000000001') = 0, 'workspace generator keeps deleted service period removed');
select pg_temp.check(public.generate_service_deliverables('a2000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001') = 0 and not exists(select 1 from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000001' and deliverable_definition_id = 'a4000000-0000-4000-8000-000000000001'), 'scoped generator also keeps deleted service period removed');
delete from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000001';
delete from public.projects where id = 'a5000000-0000-4000-8000-000000000001';
reset role;
select pg_temp.check(not exists(select 1 from private.deleted_task_occurrences where project_id = 'a5000000-0000-4000-8000-000000000001') and (select count(*) from public.tasks where project_id = 'a5000000-0000-4000-8000-000000000002') = 2, 'project cleanup cascades only its service deletion markers');
reset role;
grant select, insert on deletion_test_results to anon;
set local role anon;
select pg_temp.reject('delete from public.tasks where id = ''a6000000-0000-4000-8000-000000000001''', '42501', 'anonymous caller cannot delete tasks');
select pg_temp.reject('select * from private.deleted_task_occurrences', '42501', 'anonymous caller cannot read deletion markers');
reset role;
select pg_temp.check(exists(select 1 from public.tasks where id = 'a6000000-0000-4000-8000-000000000001'), 'protected task survives every unauthorized deletion attempt');
select count(*) as passed_checks, bool_and(passed) as all_passed from deletion_test_results;
rollback;
