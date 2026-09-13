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
insert into public.tasks(id,organization_id,title,status,created_by) values('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Inline assignment fixture','todo',auth.uid());
do $$ declare original jsonb; current_task jsonb; n int; begin
 select to_jsonb(t) into original from public.tasks t where id='70000000-0000-4000-8000-000000000001';
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',array['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002']::uuid[]);
 select count(*) into n from public.task_assignees where task_id='70000000-0000-4000-8000-000000000001'; if n<>2 then raise exception 'Multi-assignment/deduplication failed'; end if;
 begin
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',array['10000000-0000-4000-8000-000000000003']::uuid[]);
 raise exception 'Cross-workspace assignment allowed'; exception when foreign_key_violation then null; end;
 select count(*) into n from public.task_assignees where task_id='70000000-0000-4000-8000-000000000001'; if n<>2 then raise exception 'Failed request partially changed assignments'; end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
 begin
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','{}');
 raise exception 'Member mutation allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
 begin
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','{}');
 raise exception 'Cross-workspace task mutation allowed'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',array['10000000-0000-4000-8000-000000000004']::uuid[]);
 select count(*) into n from public.task_assignees where task_id='70000000-0000-4000-8000-000000000001' and user_id='10000000-0000-4000-8000-000000000004'; if n<>1 then raise exception 'Admin reassignment failed'; end if;
 perform public.set_task_assignees('20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','{}');
 if exists(select 1 from public.task_assignees where task_id='70000000-0000-4000-8000-000000000001') then raise exception 'Unassign failed'; end if;
 select to_jsonb(t) into current_task from public.tasks t where id='70000000-0000-4000-8000-000000000001'; if current_task is distinct from original then raise exception 'Task fields changed'; end if;
end $$;
rollback;
