-- One focused permission check. All fixture records are rolled back.
begin;
insert into auth.users(id,email) values
 ('91000000-0000-4000-8000-000000000001','cleanup-owner@example.test'),
 ('91000000-0000-4000-8000-000000000002','cleanup-admin@example.test'),
 ('91000000-0000-4000-8000-000000000003','cleanup-member@example.test');
insert into public.organizations(id,name,slug) values('92000000-0000-4000-8000-000000000001','Permission check','cleanup-permission-check');
insert into public.organization_members(organization_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','owner'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','admin'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','member');
set local role authenticated;
do $$ declare org uuid='92000000-0000-4000-8000-000000000001'; actor uuid; task uuid; n int; begin
 foreach actor in array array['91000000-0000-4000-8000-000000000001'::uuid,'91000000-0000-4000-8000-000000000002'::uuid] loop
 perform set_config('request.jwt.claim.sub',actor::text,true);
 insert into public.clients(organization_id,name,slug) values(org,'Check client',actor::text);
 insert into public.projects(organization_id,name,created_by) values(org,'Check project',actor);
 insert into public.service_templates(organization_id,code,name) values(org,actor::text,'Check service');
 task=public.save_task(org,null,'Assigned test','Original description','todo','medium',current_date,null,null,array['91000000-0000-4000-8000-000000000003'::uuid]);
 update public.tasks set title='Admin edited task' where id=task;
 if not found then raise exception 'Owner/admin task update denied'; end if;
 end loop;
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
 begin
 perform public.save_task(org,null,'Forbidden','No creation','todo','medium',current_date,null,null,'{}');
 raise exception 'Member created task';
 exception when insufficient_privilege then null; end;
 begin
 insert into public.projects(organization_id,name,created_by) values(org,'Forbidden',auth.uid());
 raise exception 'Member created project';
 exception when insufficient_privilege then null; end;
 begin
 insert into public.clients(organization_id,name,slug) values(org,'Forbidden','forbidden');
 raise exception 'Member created client';
 exception when insufficient_privilege then null; end;
 begin
 insert into public.service_templates(organization_id,code,name) values(org,'forbidden','Forbidden');
 raise exception 'Member created service configuration';
 exception when insufficient_privilege then null; end;
 update public.projects set name='Forbidden' where organization_id=org;
 get diagnostics n=row_count; if n<>0 then raise exception 'Member edited project'; end if;
 update public.service_templates set name='Forbidden' where organization_id=org;
 get diagnostics n=row_count; if n<>0 then raise exception 'Member edited service configuration'; end if;
 update public.tasks set status='in_progress' where id=task;
 if not found then raise exception 'Assigned member status update denied'; end if;
 update public.tasks set status='done' where id=task;
 if not found then raise exception 'Assigned member completion denied'; end if;
 begin
 update public.tasks set title='Forbidden' where id=task;
 raise exception 'Member edited task structure';
 exception when insufficient_privilege then null; end;
 begin
 delete from public.task_assignees where task_id=task;
 get diagnostics n=row_count; if n<>0 then raise exception 'Member changed assignments'; end if;
 end;
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
 task=public.save_task(org,null,'Unassigned test','Original description','todo','medium',current_date,null,null,'{}');
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
 update public.tasks set status='done' where id=task;
 get diagnostics n=row_count; if n<>0 then raise exception 'Member changed unassigned task'; end if;
 begin
 insert into public.task_assignees(organization_id,task_id,user_id) values(org,task,auth.uid());
 raise exception 'Member bypassed permissions through self-assignment';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
