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
console.log(`${checks} workspace filter and navigation checks passed.`);
