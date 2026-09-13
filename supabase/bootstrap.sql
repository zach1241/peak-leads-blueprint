-- Run manually as postgres in the Supabase SQL editor AFTER migrations.
-- Replace the placeholder with the existing approved owner's email. No user is created.
begin;
do $$
declare owner_id uuid; org_id uuid;
begin
  select id into owner_id from auth.users where lower(email)=lower('REPLACE_WITH_OWNER_EMAIL');
  if owner_id is null then raise exception 'Create the approved auth user first and replace the email placeholder'; end if;
  -- Fail closed on reruns: never seize ownership of an existing organization.
  insert into public.organizations(name,slug,created_by) values('Peak Leads','peak-leads',owner_id) returning id into org_id;
  insert into public.organization_members(organization_id,user_id,role) values(org_id,owner_id,'owner');
end $$;
commit;
