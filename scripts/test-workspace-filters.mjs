import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
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
    },
  }).outputText;
  new Function("require", "exports", code)(
    (name) =>
      name.startsWith(".")
        ? load(resolve(dirname(path), `${name}.ts`))
        : require(name),
    exports,
  );
  return exports;
}
const {
  normalizeTaskFilters,
  workspaceCalendar,
  taskFilterParams,
  taskSearchPattern,
  workspaceMonth,
  monthTaskScope,
} = load("src/lib/data/task-filters.ts");
const { safeDestination } = load("src/lib/navigation.ts");
let checks = 0;
function check(name, run) {
  run();
  checks++;
  console.log(`PASS ${name}`);
}
check("South Africa date crosses into Monday before UTC", () =>
  assert.deepEqual(workspaceCalendar(new Date("2026-10-11T22:05:00Z")), {
    today: "2026-10-12",
    monday: "2026-10-12",
    sunday: "2026-10-18",
  }),
);
check("Sunday belongs to the previous Monday's week", () =>
  assert.deepEqual(workspaceCalendar(new Date("2026-10-11T12:00:00Z")), {
    today: "2026-10-11",
    monday: "2026-10-05",
    sunday: "2026-10-11",
  }),
);
check("Week boundaries cross a year", () =>
  assert.deepEqual(workspaceCalendar(new Date("2027-01-01T10:00:00Z")), {
    today: "2027-01-01",
    monday: "2026-12-28",
    sunday: "2027-01-03",
  }),
);
check("Invalid URL values produce usable default filters", () =>
  assert.deepEqual(
    normalizeTaskFilters({
      view: "unknown",
      client: "not-a-uuid",
      project: "malformed",
      status: "unknown",
      priority: "other",
      sort: "sql",
      due: "never",
      q: ["a", "b"],
    }),
    {
      view: "active",
      q: "",
      status: "",
      priority: "",
      assignee: "",
      project: "",
      client: "",
      due: "",
      sort: "due",
      layout: "grouped",
    },
  ),
);
check("Duplicate query values cannot enter database filters", () =>
  assert.equal(normalizeTaskFilters({ client: ["one", "two"] }).client, ""),
);
check("Search is trimmed and length limited", () =>
  assert.equal(
    normalizeTaskFilters({ q: `  ${"x".repeat(130)}  ` }).q.length,
    120,
  ),
);
check("Literal wildcard and escape searches cannot match every task", () =>
  assert.equal(taskSearchPattern("50%_\\"), "%50\\%\\_\\\\%"),
);
check("All filters survive pagination query serialization", () => {
  const filters = normalizeTaskFilters({
    view: "history",
    q: "SEO report",
    status: "done",
    due: "week",
    sort: "newest",
    layout: "list",
    client: "ca56cb68-ac57-40b8-bce1-342120d19f7c",
  });
  assert.deepEqual(
    normalizeTaskFilters(Object.fromEntries(taskFilterParams(filters))),
    filters,
  );
});
check("Default view and sorting keep URLs clean", () =>
  assert.equal(taskFilterParams(normalizeTaskFilters({})).toString(), ""),
);
check("Login preserves task details and search query", () =>
  assert.equal(
    safeDestination(
      "/tasks/ca56cb68-ac57-40b8-bce1-342120d19f7c?view=history#comments",
    ),
    "/tasks/ca56cb68-ac57-40b8-bce1-342120d19f7c?view=history#comments",
  ),
);
for (const target of [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/tasks\r\nLocation:evil",
  "/tasks/../../login",
  "/api/private",
  "/tasks-extra",
  null,
  ["/tasks"],
]) {
  check(
    `Reject unsafe or unsupported login destination ${JSON.stringify(target)}`,
    () => assert.equal(safeDestination(target), "/dashboard"),
  );
}
check("October uses Johannesburg midnight boundaries", () =>
  assert.deepEqual(workspaceMonth(new Date("2026-10-12T10:00:00Z")), {
    start: "2026-10-01",
    end: "2026-10-31",
    startedAt: "2026-09-30T22:00:00.000Z",
    endedAt: "2026-10-31T22:00:00.000Z",
    label: "October 2026",
  }),
);
check("The default month changes before UTC midnight", () =>
  assert.equal(
    workspaceMonth(new Date("2026-09-30T22:05:00Z")).start,
    "2026-10-01",
  ),
);
check("Leap February includes the 29th", () =>
  assert.equal(
    workspaceMonth(new Date("2028-02-05T10:00:00Z")).end,
    "2028-02-29",
  ),
);
check("Month boundaries roll over the year", () =>
  assert.equal(
    workspaceMonth(new Date("2026-12-05T10:00:00Z")).endedAt,
    "2026-12-31T22:00:00.000Z",
  ),
);
check("Grouped client/service view is the default", () =>
  assert.equal(normalizeTaskFilters({}).layout, "grouped"),
);
check("Malformed layouts fall back to grouped work", () =>
  assert.equal(
    normalizeTaskFilters({ layout: ["list", "grouped"] }).layout,
    "grouped",
  ),
);

// Evaluate the actual PostgREST filter against golden task fixtures, so the
// scope cannot silently reintroduce past work or drop newly created undated work.
function splitConditions(value) {
  let depth = 0,
    start = 0;
  const conditions = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    if (value[i] === "," && depth === 0) {
      conditions.push(value.slice(start, i));
      start = i + 1;
    }
  }
  conditions.push(value.slice(start));
  return conditions;
}
function matchesFilter(task, filter) {
  if (filter.startsWith("and("))
    return splitConditions(filter.slice(4, -1)).every((part) =>
      matchesFilter(task, part),
    );
  const [, field, operator, value] =
    filter.match(/^([a-z_]+)\.(is|gte|lte|lt)\.(.+)$/) ?? [];
  if (!field) throw new Error(`Unsupported test filter ${filter}`);
  const actual = task[field];
  if (operator === "is") return value === "null" && actual === null;
  if (actual === null || actual === undefined) return false;
  return operator === "gte"
    ? actual >= value
    : operator === "lte"
      ? actual <= value
      : actual < value;
}
const scope = splitConditions(
  monthTaskScope(workspaceMonth(new Date("2026-10-12T10:00:00Z"))),
);
const taskFixtures = [
  [
    "unfinished September stays historical",
    {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      due_date: "2026-09-30",
      created_at: "2026-09-12T12:00:00Z",
      status: "todo",
    },
    false,
  ],
  [
    "newly imported September work stays historical",
    {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      due_date: "2026-10-20",
      created_at: "2026-10-10T12:00:00Z",
      status: "todo",
    },
    false,
  ],
  [
    "week crossing into October appears",
    {
      period_start: "2026-09-28",
      period_end: "2026-10-04",
      due_date: "2026-10-04",
      created_at: "2026-09-28T12:00:00Z",
    },
    true,
  ],
  [
    "week crossing into November appears",
    {
      period_start: "2026-10-26",
      period_end: "2026-11-01",
      due_date: "2026-11-01",
      created_at: "2026-10-26T12:00:00Z",
    },
    true,
  ],
  [
    "wholly November work stays outside October",
    {
      period_start: "2026-11-02",
      period_end: "2026-11-08",
      due_date: "2026-11-08",
      created_at: "2026-10-12T12:00:00Z",
    },
    false,
  ],
  [
    "October deadline includes an older one-off task",
    {
      period_start: null,
      period_end: null,
      due_date: "2026-10-05",
      created_at: "2026-09-20T12:00:00Z",
    },
    true,
  ],
  [
    "old one-off deadline takes precedence over recent creation",
    {
      period_start: null,
      period_end: null,
      due_date: "2026-09-30",
      created_at: "2026-10-05T12:00:00Z",
    },
    false,
  ],
  [
    "new undated work is visible",
    {
      period_start: null,
      period_end: null,
      due_date: null,
      created_at: "2026-10-05T12:00:00Z",
    },
    true,
  ],
  [
    "older undated work stays historical",
    {
      period_start: null,
      period_end: null,
      due_date: null,
      created_at: "2026-09-20T12:00:00Z",
    },
    false,
  ],
  [
    "SAST month boundary includes new undated work",
    {
      period_start: null,
      period_end: null,
      due_date: null,
      created_at: "2026-09-30T22:05:00.000Z",
    },
    true,
  ],
  [
    "next month's undated work is excluded at the boundary",
    {
      period_start: null,
      period_end: null,
      due_date: null,
      created_at: "2026-10-31T22:00:00.000Z",
    },
    false,
  ],
];
for (const [name, task, expected] of taskFixtures)
  check(name, () =>
    assert.equal(
      scope.some((filter) => matchesFilter(task, filter)),
      expected,
    ),
  );
console.log(`${checks} total workspace checks passed.`);
