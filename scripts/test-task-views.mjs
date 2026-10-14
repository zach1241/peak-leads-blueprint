import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  const path = resolve(relative);
  if (cache.has(path)) return cache.get(path);
  const exports = {};
  cache.set(path, exports);
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "exports", code)((name) => {
    if (name === "next/link") return {
      __esModule: true,
      default: ({ children, ...props }) => createElement("a", props, children),
    };
    if (name.endsWith(".module.css")) return {
      __esModule: true,
      default: new Proxy({}, { get: (_, key) => String(key) }),
    };
    if (name === "@/components/work/status-editor") return { StatusEditor: () => null };
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    if (name.startsWith(".")) return load(resolve(dirname(path), `${name}.ts`));
    return require(name);
  }, exports);
  return exports;
}

const {
  calendarTaskBuckets,
  taskTimelinePlacement,
  validateTaskContextFilters,
  changeTaskFilterClient,
  serviceFilterProjects,
} = load("src/lib/data/task-view-models.ts");
const { TaskCalendar, TaskGantt } = load("src/components/work/task-visualizations.tsx");
const october = { start: "2026-10-01", end: "2026-10-31", label: "October 2026" };
let checks = 0;
function check(name, run) {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

check("A weekly work period ending next month spans every visible day", () => {
  const result = taskTimelinePlacement({ period_start: "2026-10-26", period_end: "2026-11-01", due_date: "2026-11-01" }, october);
  assert.equal(result.startColumn, 26);
  assert.equal(result.span, 6);
  assert.equal(result.milestone, false);
  assert.equal(result.visible, true);
});
check("A work period starting in the previous month clips to the first day", () => {
  const result = taskTimelinePlacement({ period_start: "2026-09-28", period_end: "2026-10-04", due_date: "2026-10-04" }, october);
  assert.equal(result.startColumn, 1);
  assert.equal(result.span, 4);
});
check("Work periods clip across the year boundary", () => {
  const result = taskTimelinePlacement({ period_start: "2026-12-28", period_end: "2027-01-03", due_date: "2027-01-03" }, { start: "2027-01-01", end: "2027-01-31", label: "January 2027" });
  assert.equal(result.startColumn, 1);
  assert.equal(result.span, 3);
});
check("February clipping includes leap day", () => {
  const result = taskTimelinePlacement({ period_start: "2028-02-26", period_end: "2028-03-03", due_date: "2028-03-03" }, { start: "2028-02-01", end: "2028-02-29", label: "February 2028" });
  assert.equal(result.startColumn, 26);
  assert.equal(result.span, 4);
});
check("A due date without a work period stays a one-day milestone", () => {
  const result = taskTimelinePlacement({ period_start: null, period_end: null, due_date: "2026-10-15" }, october);
  assert.equal(result.startColumn, 15);
  assert.equal(result.span, 1);
  assert.equal(result.milestone, true);
});
check("Unscheduled and invalid periods do not invent a work bar", () => {
  assert.equal(taskTimelinePlacement({ period_start: null, period_end: null, due_date: null }, october), null);
  assert.equal(taskTimelinePlacement({ period_start: "2026-10-15", period_end: "2026-10-10", due_date: "2026-10-15" }, october), null);
});
check("Periods entirely outside the display month are explicitly offscreen", () => {
  assert.equal(taskTimelinePlacement({ period_start: "2026-11-02", period_end: "2026-11-08", due_date: "2026-11-08" }, october).visible, false);
});

const calendarTasks = Array.from({ length: 31 }, (_, index) => ({
  id: `deadline-${index}`,
  title: `Monthly task ${index}`,
  due_date: "2026-10-31",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  clients: { name: "Client" },
  service_deliverables: null,
}));
calendarTasks.push({ ...calendarTasks[0], id: "next-month", due_date: "2026-11-01" });
calendarTasks.push({ ...calendarTasks[0], id: "undated", due_date: null });
check("Calendar buckets preserve every task including dates outside the month", () => {
  const result = calendarTaskBuckets(calendarTasks, october);
  assert.equal(result.byDate.get("2026-10-31").length, 31);
  assert.equal(result.outside.length, 1);
  assert.equal(result.undated.length, 1);
});
check("Calendar renders every same-day task behind an accessible overflow summary", () => {
  const html = renderToStaticMarkup(createElement(TaskCalendar, { tasks: calendarTasks, month: october }));
  assert.match(html, /<details class="dayOverflow">/);
  assert.match(html, /<summary[^>]*aria-label="Show 26 more tasks due/);
  for (const task of calendarTasks) assert.ok(html.includes(`href="/tasks/${task.id}"`));
  assert.equal((html.match(/href="\/tasks\//g) || []).length, calendarTasks.length);
  assert.match(html, /Deadlines outside October 2026/);
  assert.match(html, /No due date/);
});
check("Gantt renders a clipped, accessible six-day link for the crossing week", () => {
  const task = { ...calendarTasks[0], period_start: "2026-10-26", period_end: "2026-11-01", due_date: "2026-11-01" };
  const html = renderToStaticMarkup(createElement(TaskGantt, { tasks: [task], month: october }));
  assert.match(html, /class="bar" style="grid-column:26 \/ span 6"/);
  assert.match(html, /aria-label="Monthly task 0:/);
});

const directory = {
  clients: [{ id: "client-a", name: "A" }, { id: "client-b", name: "B" }],
  projects: [
    { id: "service-a", name: "SEO", client_id: "client-a", status: "active", service_template_id: "template" },
    { id: "service-b", name: "Social", client_id: "client-b", status: "active", service_template_id: "template" },
    { id: "paused-a", name: "Paused", client_id: "client-a", status: "on_hold", service_template_id: "template" },
    { id: "manual-a", name: "General", client_id: "client-a", status: "active", service_template_id: null },
  ],
};
check("Changing a client immediately clears the selected service", () => {
  assert.deepEqual(changeTaskFilterClient("client-b"), { client: "client-b", project: "" });
  assert.deepEqual(changeTaskFilterClient(""), { client: "", project: "" });
});
check("Service choices update for the client and exclude inactive/non-package projects", () => {
  assert.deepEqual(serviceFilterProjects(directory.projects, "client-a").map((project) => project.id), ["service-a"]);
  assert.deepEqual(serviceFilterProjects(directory.projects, "client-b").map((project) => project.id), ["service-b"]);
});
check("A stale service belonging to another client is cleared before querying", () => {
  assert.deepEqual(validateTaskContextFilters({ client: "client-b", project: "service-a", status: "review", q: "SEO" }, directory), { client: "client-b", project: "", status: "review", q: "SEO" });
});
check("Unknown clients clear stale context and inactive services are removed", () => {
  assert.deepEqual(validateTaskContextFilters({ client: "not-in-workspace", project: "service-a" }, directory), { client: "", project: "" });
  assert.deepEqual(validateTaskContextFilters({ client: "client-a", project: "paused-a" }, directory), { client: "client-a", project: "" });
  assert.deepEqual(validateTaskContextFilters({ client: "client-a", project: "missing-service" }, directory), { client: "client-a", project: "" });
});
check("Valid client/service pairs and unscoped active services survive validation", () => {
  assert.deepEqual(validateTaskContextFilters({ client: "client-a", project: "service-a" }, directory), { client: "client-a", project: "service-a" });
  assert.deepEqual(validateTaskContextFilters({ client: "", project: "service-b" }, directory), { client: "", project: "service-b" });
});

console.log(`${checks} task view regression checks passed.`);
