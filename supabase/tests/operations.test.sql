begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(34);

-- Synthetic users are confined to this rolled-back test transaction.
insert into auth.users(id,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','{"full_name":"Owner A"}'),
 ('10000000-0000-4000-8000-000000000002','{"full_name":"Member A"}'),
 ('10000000-0000-4000-8000-000000000003','{"full_name":"Owner B"}'),
 ('10000000-0000-4000-8000-000000000004','{"full_name":"Admin A"}');
select is((select count(*)::int from profiles where id::text like '10000000-%'),4,'auth trigger creates profiles');
insert into organizations(id,name,slug) values ('20000000-0000-4000-8000-000000000001','Workspace A','rls-test-a'),('20000000-0000-4000-8000-000000000002','Workspace B','rls-test-b');
insert into organization_members(organization_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','admin'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','owner');
insert into clients(id,organization_id,name,slug) values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Client A','client-a'),('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Client B','client-b');
insert into projects(id,organization_id,name) values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Project A'),('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Project B');
insert into tasks(id,organization_id,title) values ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Task A'),('50000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Task B');
insert into comments(organization_id,task_id,author_id,body) values ('20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','Private B comment');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from organizations),1,'member sees only their organization');
select is((select count(*)::int from clients),1,'member sees only organization clients');
select is((select count(*)::int from projects),1,'member sees only organization projects');
select is((select count(*)::int from tasks),1,'member sees only organization tasks');
select is((select count(*)::int from comments),0,'member cannot read organization B comments');
select is((select count(*)::int from activity_logs where organization_id='20000000-0000-4000-8000-000000000002'),0,'member cannot read organization B activity');
select is((select count(*)::int from profiles),3,'profiles limited to shared workspaces');
select throws_ok($$insert into organization_members(organization_id,user_id,role) values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','admin')$$,'42501',null,'member cannot add membership');
select lives_ok($$update organization_members set role='admin' where user_id=auth.uid()$$,'member role update affects no rows');
select is((select role::text from organization_members where user_id=auth.uid()),'member','member cannot promote self');
select throws_ok($$insert into clients(organization_id,name,slug) values('20000000-0000-4000-8000-000000000001','Forbidden','forbidden')$$,'42501',null,'members cannot create core client data');
select throws_ok($$insert into tasks(organization_id,title,created_by) values('20000000-0000-4000-8000-000000000002','Forbidden',auth.uid())$$,'42501',null,'member cannot insert into organization B');
select lives_ok($$update tasks set title='Member updated A' where id='50000000-0000-4000-8000-000000000001'$$,'member can update their task');
select throws_ok($$update tasks set organization_id='20000000-0000-4000-8000-000000000002' where id='50000000-0000-4000-8000-000000000001'$$,'42501',null,'task tenant cannot be changed');
select throws_ok($$update tasks set project_id='40000000-0000-4000-8000-000000000002' where id='50000000-0000-4000-8000-000000000001'$$,'23503',null,'cross-organization project rejected');
select throws_ok($$update tasks set client_id='30000000-0000-4000-8000-000000000002' where id='50000000-0000-4000-8000-000000000001'$$,'23503',null,'cross-organization client rejected');
select throws_ok($$insert into task_assignees(organization_id,task_id,user_id) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003')$$,'23503',null,'cross-organization assignee rejected');
select lives_ok($$insert into task_assignees(organization_id,task_id,user_id) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',auth.uid())$$,'valid assignee accepted');
select throws_ok($$insert into comments(organization_id,task_id,author_id,body) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Forged author')$$,'42501',null,'comment author cannot be forged');
select lives_ok($$insert into comments(organization_id,task_id,author_id,body) values('20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',auth.uid(),'A real comment')$$,'member can comment');
select throws_ok($$insert into activity_logs(organization_id,entity_type,entity_id,action) values('20000000-0000-4000-8000-000000000001','task','50000000-0000-4000-8000-000000000001','forged')$$,'42501',null,'client cannot forge activity');
select lives_ok($$update tasks set status='done' where id='50000000-0000-4000-8000-000000000001'$$,'task completion succeeds');
select is((select count(*)::int from activity_logs where action='completed' and actor_id=auth.uid()),1,'completion generates actor-bound activity');
select throws_ok($$select save_task('20000000-0000-4000-8000-000000000001',null,'Must roll back',null,'todo','medium',null,null,null,array['10000000-0000-4000-8000-000000000003']::uuid[])$$,'23503',null,'atomic save rejects foreign assignee');
select is((select count(*)::int from tasks where title='Must roll back'),0,'invalid assignment rolls back task creation');
select throws_ok($$update profiles set full_name='Spoof',id='10000000-0000-4000-8000-000000000003' where id=auth.uid()$$,'42501',null,'profile identity protected by column privileges');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select throws_ok($$update organization_members set role='member' where user_id='10000000-0000-4000-8000-000000000001'$$,'42501',null,'admin cannot demote owner');
select lives_ok($$update organization_members set role='admin' where user_id='10000000-0000-4000-8000-000000000002'$$,'admin can manage non-owner membership');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$delete from organization_members where user_id=auth.uid()$$,'23514',null,'last owner cannot be removed');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from tasks where id='50000000-0000-4000-8000-000000000001'),0,'owner B cannot read task A by known ID');
with changed as (update tasks set title='Hijacked' where id='50000000-0000-4000-8000-000000000001' returning id) select is((select count(*)::int from changed),0,'owner B cannot update task A by known ID');
reset role;
set local role anon;
select throws_ok($$select * from tasks$$,'42501',null,'anonymous callers cannot read tasks');
select throws_ok($$select save_task('20000000-0000-4000-8000-000000000001',null,'Forbidden',null,'todo','medium',null,null,null,'{}'::uuid[])$$,'42501',null,'anonymous caller cannot execute task mutation');
reset role;
select * from finish();
rollback;
