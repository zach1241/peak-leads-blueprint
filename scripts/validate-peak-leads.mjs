import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[2];
if (!path)
  throw new Error("Usage: node scripts/validate-peak-leads.mjs OUTPUT.sql");
const services = JSON.parse(
  readFileSync(new URL("../data/peak-leads-services.json", import.meta.url)),
);
const clients = JSON.parse(
  readFileSync(new URL("../data/peak-leads-clients.json", import.meta.url)),
);
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const expected = services.flatMap((s) =>
  s.deliverables.map((d) => ({
    service: s.code,
    code: d.code,
    min: d.min,
    max: d.max,
    unit: d.unit,
    cadence: d.cadence,
  })),
);
const mappings = clients.flatMap((c) =>
  c.services.map((s) => ({ client: c.slug, service: s })),
);
writeFileSync(
  path,
  `with org as (select id from public.organizations where slug='peak-leads' and name='Peak Leads'), expected as (select * from jsonb_to_recordset(${q(JSON.stringify(expected))}::jsonb) as e(service text,code text,min int,max int,unit text,cadence text)), expected_mapping as (select * from jsonb_to_recordset(${q(JSON.stringify(mappings))}::jsonb) as e(client text,service text)), actual_mapping as (select c.slug client,s.code service from public.projects p join public.clients c on c.id=p.client_id join public.service_templates s on s.id=p.service_template_id where p.organization_id=(select id from org) and p.status='active')
select jsonb_pretty(jsonb_build_object(
'counts',(select jsonb_build_object('clients',(select count(*) from public.clients where organization_id=o.id),'projects',(select count(*) from public.projects where organization_id=o.id),'service_templates',(select count(*) from public.service_templates where organization_id=o.id),'definitions',(select count(*) from public.service_deliverables where organization_id=o.id),'tasks',(select count(*) from public.tasks where organization_id=o.id),'responsibilities',(select count(*) from public.managed_responsibilities where organization_id=o.id),'assignees',(select count(*) from public.task_assignees where organization_id=o.id),'activity_logs',(select count(*) from public.activity_logs where organization_id=o.id)) from org o),
'clients',(select jsonb_agg(jsonb_build_object('name',c.name,'contact',c.primary_contact_name,'services',(select jsonb_agg(jsonb_build_object('name',p.name,'status',p.status,'template',s.code)) from public.projects p left join public.service_templates s on s.id=p.service_template_id where p.client_id=c.id),'tasks',(select count(*) from public.tasks where client_id=c.id),'responsibilities',(select count(*) from public.managed_responsibilities where client_id=c.id))) from public.clients c where c.organization_id=(select id from org)),
'periods',(select jsonb_agg(to_jsonb(p)) from (select period_start,period_end,count(*) tasks from public.tasks where organization_id=(select id from org) group by 1,2 order by 1) p),
'definition_mismatches',(select count(*) from expected e left join public.service_templates s on s.organization_id=(select id from org) and s.code=e.service left join public.service_deliverables d on d.service_template_id=s.id and d.code=e.code where d.id is null or d.target_min<>e.min or d.target_max<>e.max or d.unit<>e.unit or d.cadence<>e.cadence),
'mapping_mismatches',(select count(*) from ((select * from expected_mapping except select * from actual_mapping) union all (select * from actual_mapping except select * from expected_mapping)) x),
'duplicate_clients',(select count(*) from (select lower(name) from public.clients where organization_id=(select id from org) group by 1 having count(*)>1) x),
'duplicate_projects',(select count(*) from (select client_id,lower(name) from public.projects where organization_id=(select id from org) group by 1,2 having count(*)>1) x),
'duplicate_tasks',(select count(*) from (select project_id,deliverable_definition_id,period_start from public.tasks where organization_id=(select id from org) group by 1,2,3 having count(*)>1) x),
'snapshot_mismatches',(select count(*) from public.tasks t join public.service_deliverables d on d.id=t.deliverable_definition_id where t.organization_id=(select id from org) and (t.target_min<>d.target_min or t.target_max<>d.target_max or t.target_unit<>d.unit)),
'completed_quantity',(select sum(completed_quantity) from public.tasks where organization_id=(select id from org)),
'rls_tables',(select jsonb_object_agg(tablename,rowsecurity) from pg_tables where schemaname='public'),
'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations)
)) as import_validation;`,
);
console.log(`Read-only validation written to ${path}`);
