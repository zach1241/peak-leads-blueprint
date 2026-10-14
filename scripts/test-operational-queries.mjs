import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";

// Exercise the real query builders against an in-memory HTTP transport. No
// external connection, database credentials, or writes are used by this suite.
const require = createRequire(import.meta.url);
const realDate = Date;
globalThis.Date = class extends realDate {
  constructor(...args) { super(...(args.length ? args : ["2026-10-14T10:00:00Z"])); }
  static now() { return new realDate("2026-10-14T10:00:00Z").getTime(); }
};
const organizationId = "88888888-8888-4888-8888-888888888888";
const userId = "11111111-1111-4111-8111-111111111111";
const colleagueId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const projectId = "44444444-4444-4444-8444-444444444444";
const definitionId = "55555555-5555-4555-8555-555555555555";
const otherDefinitionId = "66666666-6666-4666-8666-666666666666";
const foreignDefinitionId = "77777777-7777-4777-8777-777777777777";
const requests = [];
const definitions = [
  { id:definitionId, organization_id:organizationId, name:"Renamed SEO report", cadence:"monthly" },
  { id:otherDefinitionId, organization_id:organizationId, name:"Weekly keyword tracking", cadence:"weekly" },
  { id:foreignDefinitionId, organization_id:"another-workspace", name:"Renamed SEO report", cadence:"monthly" },
];
const base = {
  organization_id:organizationId,client_id:clientId,project_id:projectId,
  title:"Original task title",status:"todo",priority:"medium",
  due_date:"2026-10-31",period_start:"2026-10-01",period_end:"2026-10-31",
  contract_start:"2026-10-01",contract_end:"2026-10-31",
  created_at:"2026-10-01T10:00:00Z",completed_quantity:1,target_min:2,target_max:2,target_unit:"reports",
  deliverable_definition_id:definitionId,projects:{name:"Dominate SEO",status:"active"},
  clients:{name:"Example Client"},service_deliverables:definitions[0],
  task_assignees:[{user_id:userId},{user_id:colleagueId}],
};
const tasks = [
  {...base,id:"monthly"},
  {...base,id:"weekly",title:"Weekly original title",status:"done",deliverable_definition_id:otherDefinitionId,
    service_deliverables:definitions[1],completed_quantity:50,target_min:50,target_max:50,target_unit:"keywords",
    period_start:"2026-10-12",period_end:"2026-10-18",contract_start:"2026-10-12",contract_end:"2026-10-18",due_date:"2026-10-18"},
  {...base,id:"paused",projects:{name:"Paused service",status:"on_hold"}},
  {...base,id:"manual",deliverable_definition_id:null,service_deliverables:null},
  {...base,id:"previous-week",period_start:"2026-09-28",period_end:"2026-10-04",due_date:"2026-10-04",
    contract_start:"2026-09-28",contract_end:"2026-10-04"},
  {...base,id:"old-month",period_start:"2026-09-01",period_end:"2026-09-30",due_date:"2026-10-31"},
  {...base,id:"future",period_start:"2026-11-02",period_end:"2026-11-08",due_date:"2026-11-08"},
  {...base,id:"foreign",organization_id:"another-workspace",deliverable_definition_id:foreignDefinitionId},
];

function split(value) {
  const parts=[];let depth=0,start=0,quoted=false,escaped=false;
  for(let i=0;i<value.length;i++){
    if(escaped){escaped=false;continue;}
    if(quoted&&value[i]==="\\"){escaped=true;continue;}
    if(value[i]==='"'){quoted=!quoted;continue;}
    if(quoted)continue;
    if(value[i]==="(")depth++;
    if(value[i]===")")depth--;
    if(value[i]===","&&depth===0){parts.push(value.slice(start,i));start=i+1;}
  }
  parts.push(value.slice(start));return parts;
}
function ilike(actual, quoted) {
  const pattern=quoted.startsWith('"')?JSON.parse(quoted):quoted;
  let regex="";
  for(let i=0;i<pattern.length;i++){
    const character=pattern[i];
    if(character==="\\")regex+=pattern[++i].replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    else if(character==="%")regex+=".*";
    else if(character==="_")regex+=".";
    else regex+=character.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  }
  return typeof actual==="string"&&new RegExp(`^${regex}$`,"i").test(actual);
}
function predicate(row, field, operation) {
  let actual=row[field];
  if(field==="projects.status")actual=row.projects?.status;
  if(field==="task_assignees.user_id"||field==="assigned.user_id")
    return row.task_assignees.some(assignment=>predicate(assignment,"user_id",operation));
  if(field==="assigned")actual=row.task_assignees?.length?row.task_assignees:null;
  const negated=operation.startsWith("not.");
  if(negated)return !predicate(row,field,operation.slice(4));
  const dot=operation.indexOf(".");const operator=operation.slice(0,dot);const value=operation.slice(dot+1);
  if(operator==="is")return value==="null"&&actual==null;
  if(actual==null)return false;
  if(operator==="eq")return actual===value;
  if(operator==="neq")return actual!==value;
  if(operator==="gte")return actual>=value;
  if(operator==="lte")return actual<=value;
  if(operator==="lt")return actual<value;
  if(operator==="in")return split(value.slice(1,-1)).includes(actual);
  if(operator==="ilike")return ilike(actual,value);
  throw new Error(`Unsupported fixture operation: ${operation}`);
}
function booleanFilter(row, filter) {
  if(filter.startsWith("and("))return split(filter.slice(4,-1)).every(part=>booleanFilter(row,part));
  if(filter.startsWith("or("))return split(filter.slice(3,-1)).some(part=>booleanFilter(row,part));
  const [,field,operation]=filter.match(/^([a-z_]+)\.(.+)$/)??[];
  return predicate(row,field,operation);
}
const db=createClient("https://fixture.invalid", "fixture-publishable-key", {
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:async(url,options={})=>{
    const request=new URL(String(url));const table=request.pathname.split("/").at(-1);requests.push({table,params:request.searchParams});
    assert.equal(options.method==="HEAD"||options.method==="GET",true,"Fixture transport must never write");
    let rows;
    if(table==="tasks")rows=tasks;
    else if(table==="service_deliverables")rows=definitions;
    else if(table==="clients")rows=[{id:clientId,name:"Example Client",organization_id:organizationId,status:"active"}];
    else if(table==="projects")rows=[{id:projectId,name:"Dominate SEO",client_id:clientId,organization_id:organizationId,status:"active",service_template_id:"template",service_templates:{name:"Dominate SEO"}}];
    else if(table==="organization_members")rows=[{user_id:userId,organization_id:organizationId,profiles:{full_name:"Owner"}},{user_id:colleagueId,organization_id:organizationId,profiles:{full_name:"Colleague"}}];
    else if(table==="activity_logs")rows=[];
    else throw new Error(`Unexpected fixture table: ${table}`);
    for(const[key,value]of request.searchParams){
      if(["select","order","offset","limit"].includes(key))continue;
      if(key==="or")rows=rows.filter(row=>split(value.slice(1,-1)).some(part=>booleanFilter(row,part)));
      else rows=rows.filter(row=>predicate(row,key,value));
    }
    const count=rows.length;const offset=Number(request.searchParams.get("offset")??0);const limit=Number(request.searchParams.get("limit")??count);
    rows=rows.slice(offset,offset+limit);
    return new Response(options.method==="HEAD"?null:JSON.stringify(rows),{status:200,headers:{"Content-Type":"application/json","Content-Range":`${offset}-${offset+rows.length-1}/${count}`}});
  }},
});
const context={db,organization:{id:organizationId},user:{id:userId},canAdmin:true};
const modules=new Map();
function load(path){
  path=resolve(path);if(modules.has(path))return modules.get(path);
  const exports={};modules.set(path,exports);
  const code=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  new Function("require","exports",code)((name)=>{
    if(name==="server-only")return {};
    if(name==="react")return {...require("react"),cache:fn=>fn};
    if(name==="next/navigation")return {notFound:()=>{throw new Error("not found");}};
    if(name==="next/link")return ()=>null;
    if(name==="./workspace"||name==="@/lib/data/workspace")return {requireWorkspace:async()=>context};
    if(name.startsWith("@/components/"))return {PageHeading:()=>null,Badge:()=>null,DeliveryGenerator:()=>null};
    if(name.startsWith("@/"))return load(resolve("src",`${name.slice(2)}.ts`));
    if(name.startsWith("."))return load(resolve(dirname(path),`${name}.ts`));
    return require(name);
  },exports);return exports;
}
const {taskList,dashboardCounts,taskStatusCounts,clientWorkSummary,taskDetail}=load("src/lib/data/queries.ts");
const {teamWorkload}=load("src/lib/data/team-workload.ts");
const {currentMonthBurndown}=load("src/lib/data/burndown.ts");
const Delivery=load("src/app/(app)/delivery/page.tsx").default;
let checks=0;
async function check(name,run){await run();checks++;console.log(`PASS ${name}`);}
await check("Operational list returns only this month's active service deliverables",async()=>{
  const result=await taskList({deliverablesOnly:true});
  assert.deepEqual(result.rows.map(task=>task.id),["monthly","weekly"]);assert.equal(result.count,2);
});
await check("Dashboard/status/client/team/burndown totals agree with the operational list",async()=>{
  assert.deepEqual(await dashboardCounts(),[1,0,0,1]);
  const status=await taskStatusCounts();assert.equal(status.reduce((sum,row)=>sum+row.count,0),2);
  const client=await clientWorkSummary(clientId);assert.equal(client.total,2);assert.equal(client.done,1);assert.equal(client.outstanding,1);
  const team=await teamWorkload();assert.equal(team.unassigned,0);assert.deepEqual(team.members.map(member=>[member.total,member.done,member.overdue]),[[2,1,0],[2,1,0]]);
  const chart=await currentMonthBurndown();assert.equal(chart.total,2);assert.equal(chart.remaining,1);
});
function renderedRows(element,rows=[]){
  if(!element||typeof element!=="object")return rows;
  if(Array.isArray(element)){for(const child of element)renderedRows(child,rows);return rows;}
  if(element.type==="tr"&&element.key)rows.push(element);
  renderedRows(element.props?.children,rows);return rows;
}
await check("Delivery excludes paused/history work and preserves recorded quantities",async()=>{
  const page=await Delivery({searchParams:Promise.resolve({})});const rows=renderedRows(page);
  assert.deepEqual(rows.map(row=>row.key),["monthly","weekly"]);
  assert.equal(rows[0].props.children[2].props.children[0],1);
  assert.equal(rows[1].props.children[2].props.children[0],50);
});
await check("Displayed definition names match without losing original titles or co-assignees",async()=>{
  const result=await taskList({deliverablesOnly:true,q:"Renamed",assignee:userId});
  assert.deepEqual(result.rows.map(task=>task.id),["monthly"]);assert.equal(result.count,1);
  assert.deepEqual(result.rows[0].task_assignees.map(assignment=>assignment.user_id),[userId,colleagueId]);
  const taskRequest=requests.filter(request=>request.table==="tasks").at(-1);
  assert.equal(taskRequest.params.getAll("or").length,1);
  assert.match(taskRequest.params.get("select"),/task_assignees\(user_id\),assigned:task_assignees\(user_id\)/);
  assert.equal(taskRequest.params.get("or").includes(foreignDefinitionId),false);
  assert.equal((await taskList({deliverablesOnly:true,q:"Original task"})).count,1);
});
await check("A search match cannot bring paused services or previous months back",async()=>{
  assert.deepEqual((await taskList({deliverablesOnly:true,q:"Original"})).rows.map(task=>task.id),["monthly","weekly"]);
});
await check("Generic project work and explicit history remain accessible",async()=>{
  const project=await taskList({project:projectId});assert.equal(project.rows.some(task=>task.id==="manual"),true);
  const history=await taskList({view:"history"});assert.equal(history.rows.some(task=>task.id==="old-month"),true);
  assert.equal(history.rows.some(task=>task.id==="paused"),true);
});
await check("Direct task details keep saved history accessible",async()=>{
  // Use a real UUID for the route guard while keeping the fixture historical.
  const historical=tasks.find(task=>task.id==="old-month");const original=historical.id;historical.id="99999999-9999-4999-8999-999999999999";
  try{assert.equal((await taskDetail(historical.id)).id,historical.id);}finally{historical.id=original;}
});
console.log(`${checks} operational query checks passed.`);
globalThis.Date=realDate;
