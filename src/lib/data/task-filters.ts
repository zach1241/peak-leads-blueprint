import { z } from "zod";
import { priorities, taskStatuses } from "./constants";

export const taskViews = [
  "active",
  "mine",
  "overdue",
  "unassigned",
  "history",
] as const;
export type TaskView = (typeof taskViews)[number];
export type TaskFilters = {
  view: TaskView;
  q: string;
  status: string;
  priority: string;
  assignee: string;
  project: string;
  client: string;
  due: string;
  sort: string;
  layout: "grouped" | "list";
};

export function workspaceCalendar(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const monday = new Date(`${today}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return {
    today,
    monday: monday.toISOString().slice(0, 10),
    sunday: sunday.toISOString().slice(0, 10),
  };
}

export function workspaceMonth(now = new Date()) {
  const { today } = workspaceCalendar(now);
  const [year, month] = today.split("-").map(Number);
  const start = `${today.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return {
    start,
    end,
    startedAt: new Date(`${start}T00:00:00+02:00`).toISOString(),
    endedAt: new Date(`${next}T00:00:00+02:00`).toISOString(),
    label: new Intl.DateTimeFormat("en-ZA", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Johannesburg",
    }).format(now),
  };
}

// The deliverables workspace is a fresh monthly queue. An unfinished prior-month
// item must not roll into the current month merely because its due date moved.
// Weekly deliverables are assigned to the month in which their period starts.
export function currentMonthDeliverableScope(month = workspaceMonth()) {
  return `and(period_start.gte.${month.start},period_start.lte.${month.end}),and(period_start.is.null,period_end.is.null,due_date.gte.${month.start},due_date.lte.${month.end}),and(period_start.is.null,period_end.is.null,due_date.is.null,created_at.gte.${month.startedAt},created_at.lt.${month.endedAt})`;
}

// A work period takes precedence over its deadline or creation date. Weekly
// periods crossing the month boundary belong to both months. New undated work
// remains actionable; older undated work is available through History.
export function monthTaskScope(month = workspaceMonth()) {
  return `and(period_start.lte.${month.end},period_end.gte.${month.start}),and(period_start.is.null,period_end.is.null,due_date.gte.${month.start},due_date.lte.${month.end}),and(period_start.is.null,period_end.is.null,due_date.is.null,created_at.gte.${month.startedAt},created_at.lt.${month.endedAt})`;
}

const uuid = (value: unknown) =>
  z.uuid().safeParse(value).success ? String(value) : "";
const choice = (value: unknown, choices: readonly string[], fallback = "") =>
  typeof value === "string" && choices.includes(value) ? value : fallback;

export function normalizeTaskFilters(
  raw: Record<string, unknown>,
): TaskFilters {
  return {
    view: choice(raw.view, taskViews, "active") as TaskView,
    q: typeof raw.q === "string" ? raw.q.trim().slice(0, 120) : "",
    status: choice(raw.status, taskStatuses),
    priority: choice(raw.priority, priorities),
    assignee: uuid(raw.assignee),
    project: uuid(raw.project),
    client: uuid(raw.client),
    due: choice(raw.due, ["today", "week", "overdue", "undated"]),
    sort: choice(raw.sort, ["due", "newest", "oldest", "title"], "due"),
    layout: choice(raw.layout, ["grouped", "list"], "grouped") as
      "grouped" | "list",
  };
}

export function taskFilterParams(filters: TaskFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value &&
      !(key === "view" && value === "active") &&
      !(key === "layout" && value === "grouped") &&
      !(key === "sort" && value === "due")
    )
      query.set(key, value);
  }
  return query;
}

// ilike uses SQL pattern syntax. Treat searches as literal text.
export function taskSearchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
