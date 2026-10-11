-- Run through Supabase SQL Editor or execute_sql. Every write is rolled back.
-- Uses the existing Peak Leads owner and normal authenticated RLS policies.
begin;
select set_config('request.jwt.claim.sub',(
  select m.user_id::text from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where m.role='owner' and o.slug='peak-leads'
  order by m.created_at limit 1
),true);
set local role authenticated;
do $$
declare
  test_org uuid; test_id uuid; stamp timestamptz; changed int; delivery record; member_id uuid;
begin
  select id into test_org from public.organizations where slug='peak-leads';
  insert into public.tasks(organization_id,title,status,updated_at,created_by)
  values(test_org,'Temporary polish regression check','todo',now()-interval '1 hour',auth.uid())
  returning id,updated_at into test_id,stamp;
  update public.tasks set status='backlog' where id=test_id and updated_at=stamp;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Owner status update failed'; end if;
  update public.tasks set status='done' where id=test_id and updated_at=stamp;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Stale status overwrote newer task'; end if;
  update public.tasks set status='cancelled' where id=test_id;
  if not exists(select 1 from public.tasks where id=test_id and status='cancelled') then
    raise exception 'Cancelled status unavailable';
  end if;
  select id,target_min,updated_at into delivery from public.tasks
  where organization_id=test_org and deliverable_definition_id is not null and status='todo' and target_min>0 limit 1;
  if delivery.id is null then raise exception 'Missing deliverable test candidate'; end if;
  update public.tasks set completed_quantity=delivery.target_min where id=delivery.id and updated_at=delivery.updated_at;
  if not exists(select 1 from public.tasks where id=delivery.id and status='done' and completed_quantity=delivery.target_min) then
    raise exception 'Quantity did not complete task';
  end if;
  update public.tasks set completed_quantity=0 where id=delivery.id and updated_at=delivery.updated_at;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Stale quantity overwrote newer delivery'; end if;
  select user_id into member_id from public.organization_members where organization_id=test_org and role='member' order by created_at limit 1;
  if member_id is null then raise exception 'Missing member for permission regression'; end if;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  update public.tasks set status='todo' where id=test_id;
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Member edited an unassigned task'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if exists(select 1 from public.tasks where organization_id=test_org) then
    raise exception 'Non-member read workspace tasks';
  end if;
end;
$$;
rollback;
