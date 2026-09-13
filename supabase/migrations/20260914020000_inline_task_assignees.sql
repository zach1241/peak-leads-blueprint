begin;
-- Assignment-only mutation: preserves every task field and applies the set atomically.
create function public.set_task_assignees(p_organization_id uuid, p_task_id uuid, p_assignees uuid[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not private.has_role(p_organization_id,array['owner','admin']::public.organization_role[]) then
  raise exception 'Only owners and admins can change assignments' using errcode='42501';
 end if;
 if cardinality(p_assignees)>100 then raise exception 'Too many assignees' using errcode='22023'; end if;
 perform 1 from public.tasks where organization_id=p_organization_id and id=p_task_id for update;
 if not found then raise exception 'Task not found in this workspace' using errcode='42501'; end if;
 if exists(select 1 from unnest(coalesce(p_assignees,'{}'::uuid[])) u where u is null or not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=u)) then
  raise exception 'Choose members of this workspace' using errcode='23503';
 end if;
 delete from public.task_assignees where organization_id=p_organization_id and task_id=p_task_id and not(user_id=any(coalesce(p_assignees,'{}'::uuid[])));
 insert into public.task_assignees(organization_id,task_id,user_id)
 select p_organization_id,p_task_id,u from unnest(coalesce(p_assignees,'{}'::uuid[])) u on conflict(task_id,user_id) do nothing;
end $$;
revoke all on function public.set_task_assignees(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.set_task_assignees(uuid,uuid,uuid[]) to authenticated;
commit;
