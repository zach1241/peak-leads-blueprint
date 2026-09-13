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
insert into public.sops(id,organization_id,title,resource_url,resource_type,created_by) values
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Test SOP','https://example.test/tutorial','document','10000000-0000-4000-8000-000000000001');
update public.sops set title='Owner edit' where id='30000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
 select count(*) into n from public.sops where id='30000000-0000-4000-8000-000000000001'; if n<>1 then raise exception 'Member cannot view SOP'; end if;
 begin
 insert into public.sops(organization_id,title,resource_url,resource_type,created_by) values('20000000-0000-4000-8000-000000000001','Forbidden','https://example.test','other',auth.uid());
 raise exception 'Member SOP insert allowed'; exception when insufficient_privilege then null; end;
 update public.sops set title='Forbidden' where id='30000000-0000-4000-8000-000000000001'; get diagnostics n=row_count; if n<>0 then raise exception 'Member SOP update allowed'; end if;
 delete from public.sops where id='30000000-0000-4000-8000-000000000001'; get diagnostics n=row_count; if n<>0 then raise exception 'Member SOP delete allowed'; end if;
end $$;
insert into public.help_requests(id,organization_id,title,description,requester_id) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Help','A blocker',auth.uid());
update public.help_requests set description='Member edit' where id='40000000-0000-4000-8000-000000000001';
do $$ begin
 begin update public.help_requests set status='resolved' where id='40000000-0000-4000-8000-000000000001'; raise exception 'Member status escalation allowed'; exception when insufficient_privilege then null; end;
 begin update public.help_requests set requester_id='10000000-0000-4000-8000-000000000001' where id='40000000-0000-4000-8000-000000000001'; raise exception 'Requester reassignment allowed'; exception when insufficient_privilege then null; end;
 if not private.resource_image_access('20000000-0000-4000-8000-000000000001/help/10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.png',true) then raise exception 'Member upload blocked'; end if;
 if private.resource_image_access('20000000-0000-4000-8000-000000000001/sops/10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.png',true) then raise exception 'Member SOP upload allowed'; end if;
 if private.resource_image_access('20000000-0000-4000-8000-000000000002/help/10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.png',false) then raise exception 'Cross-workspace image access'; end if;
 if private.resource_image_access('20000000-0000-4000-8000-000000000001/help/10000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000001.png',true) then raise exception 'Other-user upload allowed'; end if;
end $$;
insert into storage.objects(bucket_id,name) values ('workspace-images','20000000-0000-4000-8000-000000000001/help/10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.png');
update public.help_requests set image_path='20000000-0000-4000-8000-000000000001/help/10000000-0000-4000-8000-000000000002/50000000-0000-4000-8000-000000000001.png' where id='40000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.sops) or exists(select 1 from public.help_requests) or exists(select 1 from storage.objects where bucket_id='workspace-images') then raise exception 'Cross-workspace records visible'; end if;
 begin insert into public.help_requests(organization_id,title,description,requester_id) values('20000000-0000-4000-8000-000000000001','Forbidden','Cross workspace',auth.uid()); raise exception 'Cross-workspace insert allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
do $$ declare n int; begin
 update public.sops set title='Admin edit' where id='30000000-0000-4000-8000-000000000001'; get diagnostics n=row_count; if n<>1 then raise exception 'Admin SOP update blocked'; end if;
 update public.help_requests set status='in_progress' where id='40000000-0000-4000-8000-000000000001';
 select count(*) into n from public.help_requests where status<>'resolved'; if n<>1 then raise exception 'Unresolved count wrong'; end if;
 update public.help_requests set status='resolved' where id='40000000-0000-4000-8000-000000000001';
 select count(*) into n from public.help_requests where status<>'resolved'; if n<>0 then raise exception 'Resolved request still counted'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ declare n int; begin
 update public.help_requests set description='Forbidden' where id='40000000-0000-4000-8000-000000000001'; get diagnostics n=row_count; if n<>0 then raise exception 'Requester edited resolved request'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
delete from public.sops where id='30000000-0000-4000-8000-000000000001';
delete from public.help_requests where id='40000000-0000-4000-8000-000000000001';
-- Verify the new audit source records initial state, completion AND reopening.
insert into public.tasks(id,organization_id,title,status,created_by) values('60000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Burndown fixture','todo',auth.uid());
update public.tasks set status='done' where id='60000000-0000-4000-8000-000000000001';
update public.tasks set status='in_progress' where id='60000000-0000-4000-8000-000000000001';
do $$ declare n int; final_status text; begin
 select count(*) into n from public.activity_logs where entity_id='60000000-0000-4000-8000-000000000001' and action='status_changed'; if n<>3 then raise exception 'Status events missing'; end if;
 select metadata->>'status' into final_status from public.activity_logs where entity_id='60000000-0000-4000-8000-000000000001' and action='status_changed' order by created_at desc limit 1; if final_status<>'in_progress' then raise exception 'Reopen event ordering incorrect'; end if;
end $$;
rollback;
