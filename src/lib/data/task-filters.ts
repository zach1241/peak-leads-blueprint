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

// Include unfinished work from past periods and undated repeating sources.
// Historical completed occurrences remain accessible through History.
export function activeTaskScope(today: string) {
  return `and(period_start.is.null,period_end.is.null),and(period_start.lte.${today},period_end.gte.${today}),and(period_end.lt.${today},status.not.in.(done,cancelled))`;
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
  };
}

export function taskFilterParams(filters: TaskFilters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      value &&
      !(key === "view" && value === "active") &&
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
