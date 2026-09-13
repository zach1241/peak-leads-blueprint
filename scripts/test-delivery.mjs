// Local PostgreSQL transaction: real importer twice, exact source validation, RLS and recurrence.
// All fixtures roll back; refuses to use a hosted database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "peak-delivery-test-"));
const file = join(dir, "import.sql");
const email = "delivery-owner@example.test";
const services = JSON.parse(
  readFileSync(new URL("../data/peak-leads-services.json", import.meta.url)),
);
const clients = JSON.parse(
  readFileSync(new URL("../data/peak-leads-clients.json", import.meta.url)),
);
const q = (value) => "'" + String(value).replaceAll("'", "''") + "'";
try {
  execFileSync("node", ["scripts/import-peak-leads.mjs", email, file]);
  const body = readFileSync(file, "utf8")
    .replace(/^begin;\n/, "")
    .replace(/commit;\s*$/, "");
  const tests = [];
  const is = (query, expected, label) =>
    tests.push(
      query.startsWith("with changed as")
        ? `${query.slice(0, query.indexOf(" select count"))} select is((select count(*) from changed)::int,${expected},${q(label)});`
        : `select is((${query})::int,${expected},${q(label)});`,
    );
  const throws = (sql, code, label) =>
    tests.push(`select throws_ok(${q(sql)},${q(code)},null,${q(label)});`);
  is("select count(*) from clients", 4, "four clients");
  is("select count(*) from service_templates", 5, "five templates");
  is(
    "select count(*) from service_deliverables",
    29,
    "29 numerical definitions",
  );
  is("select count(*) from projects", 8, "eight service/setup projects");
  is("select count(*) from tasks", 43, "43 current occurrences");
  is(
    "select count(*) from managed_responsibilities",
    32,
    "32 separate responsibilities",
  );
  is("select count(*) from task_assignees", 0, "no guessed assignees");
  is(
    "select count(*) from tasks t join service_deliverables d on d.id=t.deliverable_definition_id where d.cadence='monthly'",
    32,
    "32 monthly tasks",
  );
  is(
    "select count(*) from tasks t join service_deliverables d on d.id=t.deliverable_definition_id where d.cadence='weekly'",
    11,
    "11 weekly tasks",
  );
  is(
    "select generate_current_deliverables((select id from organizations where slug='peak-leads'))",
    0,
    "repeat generation inserts zero",
  );
  is(
    "select count(*) from (select project_id,deliverable_definition_id,period_start from tasks group by 1,2,3 having count(*)>1) d",
    0,
    "no duplicate occurrences",
  );
  is(
    "select count(*) from projects p join clients c on c.id=p.client_id where c.slug='fit-roofing-construction' and p.name='LSA Setup / Verification' and p.status='on_hold' and p.service_template_id is null",
    1,
    "FIT LSA remains blocked and unmapped",
  );
  for (const c of clients) {
    is(
      `select count(*) from projects p join clients c on c.id=p.client_id where c.slug=${q(c.slug)} and p.service_template_id is not null`,
      c.services.length,
      `${c.name}: exact service count`,
    );
    for (const code of c.services)
      is(
        `select count(*) from projects p join clients c on c.id=p.client_id join service_templates s on s.id=p.service_template_id where c.slug=${q(c.slug)} and s.code=${q(code)} and p.status='active'`,
        1,
        `${c.name}: ${code}`,
      );
  }
  for (const s of services)
    for (const d of s.deliverables)
      is(
        `select count(*) from service_deliverables d join service_templates s on s.id=d.service_template_id where s.code=${q(s.code)} and d.code=${q(d.code)} and d.target_min=${d.min} and d.target_max=${d.max} and d.unit=${q(d.unit)} and d.cadence=${q(d.cadence)}`,
        1,
        `${s.code}/${d.code}: exact source target`,
      );
  is(
    "select count(*) from tasks t join service_deliverables d on d.id=t.deliverable_definition_id where t.target_min<>d.target_min or t.target_max<>d.target_max or t.target_unit<>d.unit",
    0,
    "task target snapshots match definitions",
  );
  is(
    "select count(*) from tasks t join service_deliverables d on d.id=t.deliverable_definition_id where d.cadence='monthly' and (t.period_start<>date_trunc('month',now() at time zone 'Africa/Johannesburg')::date or t.period_end<>(date_trunc('month',now() at time zone 'Africa/Johannesburg')+interval '1 month - 1 day')::date)",
    0,
    "monthly dates current month only",
  );
  is(
    "select count(*) from tasks t join service_deliverables d on d.id=t.deliverable_definition_id where d.cadence='weekly' and (t.period_start<>date_trunc('week',now() at time zone 'Africa/Johannesburg')::date+case when extract(isodow from now() at time zone 'Africa/Johannesburg')>=6 then 7 else 0 end or t.period_end<>t.period_start+6)",
    0,
    "weekly dates actionable week only",
  );
  const task = "(select id from tasks order by id limit 1)";
  throws(
    `update tasks set status='done' where id=${task}`,
    "23514",
    "cannot complete without quantity",
  );
  throws(
    `update tasks set target_min=999 where id=${task}`,
    "42501",
    "target snapshots immutable",
  );
  throws(
    `update tasks set period_end=null where id=${task}`,
    "42501",
    "period cannot be removed",
  );
  throws(
    `update tasks set completed_quantity=target_max+1 where id=${task}`,
    "23514",
    "quantity bounded",
  );
  throws(
    "insert into tasks(organization_id,project_id,client_id,title,created_by,deliverable_definition_id,period_start,period_end) select organization_id,project_id,client_id,'Future',auth.uid(),deliverable_definition_id,period_start+365,period_end+365 from tasks limit 1",
    "22023",
    "future occurrences rejected",
  );
  tests.push(
    `update tasks set completed_quantity=target_min where id=${task};`,
  );
  is(
    "select count(*) from tasks where status='done'",
    1,
    "quantity reaches target and marks done",
  );
  tests.push(`update tasks set completed_quantity=0 where id=${task};`);
  is(
    "select count(*) from tasks where status='done'",
    0,
    "lowered quantity reopens task",
  );
  tests.push(
    "select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);",
  );
  throws(
    "insert into service_templates(organization_id,code,name) select id,'forged','Forged' from organizations",
    "42501",
    "member cannot create templates",
  );
  is(
    "with changed as (update service_deliverables set target_min=1 returning id) select count(*) from changed",
    0,
    "member cannot change quantities",
  );
  throws(
    "update projects set service_template_id=null where service_template_id is not null",
    "42501",
    "member cannot remove service mapping",
  );
  throws(
    "update managed_responsibilities set title='Forged'",
    "42501",
    "member cannot rewrite responsibility scope",
  );
  tests.push(
    "update managed_responsibilities set status='paused',status_note='Local permission test' where id=(select id from managed_responsibilities order by id limit 1);",
  );
  is(
    "select count(*) from managed_responsibilities where status='paused'",
    1,
    "member can manage responsibility status",
  );
  is(
    "select count(*) from tasks",
    43,
    "responsibility changes do not create numerical tasks",
  );
  is(
    "select sum(completed_quantity) from tasks",
    0,
    "responsibility changes do not affect progress",
  );
  tests.push(
    "select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);",
  );
  for (const table of [
    "service_templates",
    "service_deliverables",
    "managed_responsibilities",
    "tasks",
    "clients",
    "projects",
  ])
    is(`select count(*) from ${table}`, 0, `outsider cannot read ${table}`);
  throws(
    "select generate_current_deliverables('22000000-0000-4000-8000-000000000001')",
    "42501",
    "outsider cannot generate",
  );
  is(
    "with changed as (update tasks set completed_quantity=1 returning id) select count(*) from changed",
    0,
    "outsider cannot change delivery progress",
  );
  tests.push("reset role; set local role anon;");
  throws(
    "select * from service_templates",
    "42501",
    "anonymous cannot read templates",
  );
  throws(
    "select generate_current_deliverables('22000000-0000-4000-8000-000000000001')",
    "42501",
    "anonymous cannot generate",
  );
  tests.push("reset role;");
  is(
    "select count(*) from pg_tables where schemaname='public' and tablename in ('service_templates','service_deliverables','managed_responsibilities') and rowsecurity",
    3,
    "new tables retain RLS",
  );
  const count = tests.filter((t) =>
    /(?:select (?:is|throws_ok)\()/.test(t),
  ).length;
  const fixture = `begin; create extension if not exists pgtap with schema extensions; set search_path=public,extensions;
 select plan(${count});
 insert into auth.users(id,email,raw_user_meta_data) values('11000000-0000-4000-8000-000000000001',${q(email)},'{}'),('11000000-0000-4000-8000-000000000002','delivery-member@example.test','{}'),('11000000-0000-4000-8000-000000000003','delivery-outsider@example.test','{}');
 insert into organizations(id,name,slug) values('22000000-0000-4000-8000-000000000001','Peak Leads','peak-leads');
 insert into organization_members(organization_id,user_id,role) values('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','owner'),('22000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','member');
 ${body}
 reset role;
 ${body}
 ${tests.join("\n")}
 select * from finish(); rollback;`;
  const result = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_peak-leads-blueprint",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: fixture, encoding: "utf8", maxBuffer: 2e6 },
  );
  console.log(
    result
      .split("\n")
      .filter((line) => /^(not ok|ok |1\.\.|#)/.test(line))
      .join("\n"),
  );
  assert(!/^not ok/m.test(result), "Delivery assertions failed");
  assert.equal(
    (result.match(/^ok /gm) || []).length,
    count,
    "All planned checks ran",
  );
  console.log(
    `PASS ${count} delivery/import/security checks; all fixtures rolled back.`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
