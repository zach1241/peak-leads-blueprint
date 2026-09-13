// Generates reviewable SQL. Execute with the CLI only after reviewing the source data.
// Data writes run as the approved workspace owner under authenticated RLS.
import { readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const owner = args[0];
const output = args[1];
if (!owner || !output || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner))
  throw new Error(
    "Usage: node scripts/import-peak-leads.mjs OWNER_EMAIL OUTPUT.sql",
  );
const services = JSON.parse(
  readFileSync(
    new URL("../data/peak-leads-services.json", import.meta.url),
    "utf8",
  ),
);
const clients = JSON.parse(
  readFileSync(
    new URL("../data/peak-leads-clients.json", import.meta.url),
    "utf8",
  ),
);
const literal = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const sql = `begin;
-- Resolve an EXISTING owner; never create auth users or grant memberships.
select set_config('request.jwt.claim.sub',coalesce((select u.id::text from auth.users u join public.organization_members m on m.user_id=u.id join public.organizations o on o.id=m.organization_id where lower(u.email)=lower(${literal(owner)}) and o.slug='peak-leads' and o.name='Peak Leads' and m.role='owner'),''),true);
set local role authenticated;
set local row_security=on;
do $import$
declare org uuid; service_id uuid; client_uuid uuid; project_uuid uuid; s jsonb; d jsonb; c jsonb; r jsonb; service_code text; matches integer;
begin
 select id into org from public.organizations where slug='peak-leads' and name='Peak Leads';
 if org is null or auth.uid() is null or not private.has_role(org,array['owner']::public.organization_role[]) then raise exception 'Existing Peak Leads owner membership is required'; end if;
 for s in select value from jsonb_array_elements(${literal(JSON.stringify(services))}::jsonb) loop
  insert into public.service_templates(organization_id,code,name,source_note) values(org,s->>'code',s->>'name','Peak Leads Service Deliverables.docx; numerical scope retained exactly.') on conflict(organization_id,code) do nothing;
  select id into service_id from public.service_templates where organization_id=org and code=s->>'code';
  if exists(select 1 from public.service_templates where id=service_id and name<>s->>'name') then raise exception 'Conflicting service name: %',s->>'code'; end if;
  for d in select value from jsonb_array_elements(s->'deliverables') loop
   insert into public.service_deliverables(organization_id,service_template_id,code,name,cadence,target_min,target_max,unit,instructions) values(org,service_id,d->>'code',d->>'name',d->>'cadence',(d->>'min')::int,(d->>'max')::int,d->>'unit',coalesce(d->>'details','')) on conflict(organization_id,service_template_id,code) do nothing;
   if exists(select 1 from public.service_deliverables where organization_id=org and service_template_id=service_id and code=d->>'code' and (name<>d->>'name' or cadence<>d->>'cadence' or target_min<>(d->>'min')::int or target_max<>(d->>'max')::int or unit<>d->>'unit' or not active)) then raise exception 'Conflicting numerical definition: % / %',s->>'code',d->>'code'; end if;
  end loop;
 end loop;
 for c in select value from jsonb_array_elements(${literal(JSON.stringify(clients))}::jsonb) loop
  select count(*) into matches from public.clients where organization_id=org and (slug=c->>'slug' or lower(name)=lower(c->>'name') or lower(name) in (select lower(value) from jsonb_array_elements_text(c->'aliases')));
  if matches>1 then raise exception 'Ambiguous existing client: %',c->>'name'; end if;
  select id into client_uuid from public.clients where organization_id=org and (slug=c->>'slug' or lower(name)=lower(c->>'name') or lower(name) in (select lower(value) from jsonb_array_elements_text(c->'aliases')));
  if client_uuid is null then
   insert into public.clients(organization_id,name,slug,primary_contact_name,notes) values(org,c->>'name',c->>'slug',c->>'contact','Market: '||(c->>'market')||E'\nContact: '||(c->>'contact')||E'\n'||(c->>'notes')) returning id into client_uuid;
  end if;
  for service_code in select value from jsonb_array_elements_text(c->'services') loop
   select value into s from jsonb_array_elements(${literal(JSON.stringify(services))}::jsonb) where value->>'code'=service_code;
   select id into service_id from public.service_templates where organization_id=org and code=service_code;
   select count(*) into matches from public.projects where organization_id=org and client_id=client_uuid and (service_template_id=service_id or lower(name)=lower(s->>'name'));
   if matches>1 then raise exception 'Ambiguous service project for %: %',c->>'name',service_code; end if;
   select id into project_uuid from public.projects where organization_id=org and client_id=client_uuid and (service_template_id=service_id or lower(name)=lower(s->>'name'));
   if project_uuid is null then
    insert into public.projects(organization_id,client_id,name,description,status,created_by,service_template_id) values(org,client_uuid,s->>'name','Ongoing service. Numerical delivery periods and managed responsibilities are tracked separately.','active',auth.uid(),service_id) returning id into project_uuid;
   elsif exists(select 1 from public.projects where id=project_uuid and service_template_id is distinct from service_id) then
    raise exception 'Existing project requires manual service mapping review: %',project_uuid;
   end if;
   for r in select value from jsonb_array_elements(s->'responsibilities') loop
    insert into public.managed_responsibilities(organization_id,client_id,project_id,source_key,title,details) values(org,client_uuid,project_uuid,'service:'||service_code||':'||(r->>'code'),r->>'title',r->>'details') on conflict(organization_id,client_id,source_key) do nothing;
   end loop;
  end loop;
  for r in select value from jsonb_array_elements(c->'responsibilities') loop
   insert into public.managed_responsibilities(organization_id,client_id,source_key,title,details) values(org,client_uuid,'client:'||(r->>'code'),r->>'title',r->>'details') on conflict(organization_id,client_id,source_key) do nothing;
  end loop;
  if c ? 'setup' then
   s=c->'setup';
   select count(*) into matches from public.projects where organization_id=org and client_id=client_uuid and lower(name)=lower(s->>'name');
   if matches>1 then raise exception 'Ambiguous setup project'; end if;
   select id into project_uuid from public.projects where organization_id=org and client_id=client_uuid and lower(name)=lower(s->>'name');
   if project_uuid is null then
    insert into public.projects(organization_id,client_id,name,description,status,created_by) values(org,client_uuid,s->>'name',s->>'details','on_hold',auth.uid()) returning id into project_uuid;
   end if;
   if exists(select 1 from public.projects where id=project_uuid and (service_template_id is not null or status<>'on_hold')) then raise exception 'FIT LSA setup state needs manual review'; end if;
   insert into public.managed_responsibilities(organization_id,client_id,project_id,source_key,title,details,status) values(org,client_uuid,project_uuid,'setup:'||(s->>'code'),s->>'responsibility',s->>'details','blocked') on conflict(organization_id,client_id,source_key) do nothing;
  end if;
 end loop;
end $import$;
select public.generate_current_deliverables((select id from public.organizations where slug='peak-leads')) as generated_tasks;
commit;
`;
writeFileSync(output, sql, { mode: 0o600 });
console.log(
  `Reviewable owner-scoped import written to ${output}. No database changes made by this command.`,
);
