begin;
-- Replace only the permissive task/project write policies. Reads stay unchanged.
do $$ declare t text; begin
 foreach t in array array['tasks','projects'] loop
 execute format('drop policy work_insert on public.%I',t);
 execute format('create policy work_insert on public.%I for insert to authenticated with check(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]) and created_by=(select auth.uid()))',t);
 execute format('drop policy work_update on public.%I',t);
 execute format('create policy work_update on public.%I for update to authenticated using(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[])) with check(private.has_role(organization_id,array[''owner'',''admin'']::public.organization_role[]))',t);
 end loop;
end $$;
create policy assigned_status_update on public.tasks for update to authenticated
 using(private.is_member(organization_id) and exists(select 1 from public.task_assignees a where a.organization_id=tasks.organization_id and a.task_id=tasks.id and a.user_id=(select auth.uid())))
 with check(private.is_member(organization_id) and exists(select 1 from public.task_assignees a where a.organization_id=tasks.organization_id and a.task_id=tasks.id and a.user_id=(select auth.uid())));
-- A row policy alone cannot restrict which fields an assigned member changes.
create function private.guard_member_task_update() returns trigger language plpgsql set search_path='' as $$ begin
 if auth.uid() is not null and not private.has_role(old.organization_id,array['owner','admin']::public.organization_role[]) then
 if (to_jsonb(new)-array['status','completed_quantity','updated_at']) is distinct from (to_jsonb(old)-array['status','completed_quantity','updated_at']) then
 raise exception 'Members may only update assigned task status and delivered quantity' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_member_task_update() from public;
create trigger guard_member_task_update before update on public.tasks for each row execute function private.guard_member_task_update();
-- Prevent self-assignment through the API from bypassing assigned-only updates.
alter policy assignments_insert on public.task_assignees with check(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
alter policy assignments_delete on public.task_assignees using(private.has_role(organization_id,array['owner','admin']::public.organization_role[]));
commit;
