begin;
-- Members cannot perform general task UPDATEs. Status changes use the secure RPC below.
drop policy if exists assigned_status_update on public.tasks;
-- Members may edit their own help requests; admins can edit all.
drop policy if exists help_edit on public.help_requests;
create policy help_edit on public.help_requests for update to authenticated
using (private.has_role(organization_id, array['owner','admin']::public.organization_role[])
 or (private.is_member(organization_id) and requester_id=auth.uid()))
with check (private.has_role(organization_id, array['owner','admin']::public.organization_role[])
 or (private.is_member(organization_id) and requester_id=auth.uid()));
-- Members may remove only help requests they personally created.
drop policy if exists help_delete on public.help_requests;
create policy help_delete on public.help_requests for delete to authenticated
using (
 private.has_role(organization_id, array['owner','admin']::public.organization_role[])
 or (private.is_member(organization_id) and requester_id=auth.uid())
);
-- Status-only updates for every workspace member; no general task mutation granted.
create or replace function public.change_task_status_for_member(
 p_organization_id uuid,p_task_id uuid,p_expected_updated_at timestamptz,
 p_status public.task_status,p_quantity integer default null
) returns boolean language plpgsql security definer
set search_path='' as $$
declare t public.tasks;
begin
 if auth.uid() is null or not private.is_member(p_organization_id) then
   raise exception 'Workspace access denied' using errcode='42501';
 end if;
 select * into t from public.tasks where id=p_task_id and organization_id=p_organization_id for update;
 if not found or t.updated_at<>p_expected_updated_at then return false; end if;
 if p_quantity is not null and (p_status<>'done' or t.target_min is null or p_quantity<>t.target_min)
 then raise exception 'Invalid delivered quantity' using errcode='22023';end if;
 if p_status='done' and t.target_min is not null and coalesce(p_quantity,t.completed_quantity,0)<t.target_min
 then raise exception 'Delivered quantity required' using errcode='22023';end if;
 update public.tasks set status=p_status,completed_quantity=coalesce(p_quantity,t.completed_quantity)
 where id=p_task_id and organization_id=p_organization_id;
 return true;
end $$;
revoke all on function public.change_task_status_for_member(uuid,uuid,timestamptz,public.task_status,integer) from public,anon;
grant execute on function public.change_task_status_for_member(uuid,uuid,timestamptz,public.task_status,integer) to authenticated;
notify pgrst,'reload schema';
commit;
