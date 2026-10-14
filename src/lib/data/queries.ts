import "server-only";
import { cache } from "react";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireWorkspace } from "./workspace";
import { priorities, taskStatuses } from "./constants";
import {
  monthTaskScope,
  activeDeliverableTaskScope,
  combineTaskScopes,
  normalizeTaskFilters,
  taskSearchPattern,
  taskSearchScope,
  workspaceCalendar,
  workspaceMonth,
} from "./task-filters";
export const directories = cache(async () => {
  const { db, organization } = await requireWorkspace();
  const [clients, projects, members] = await Promise.all([
    db
      .from("clients")
      .select("id,name", { count: "exact" })
      .eq("organization_id", organization.id)
      .order("name")
      .limit(1000),
    db
      .from("projects")
      .select("id,name,client_id,status,service_template_id", { count: "exact" })
      .eq("organization_id", organization.id)
      .order("name")
      .limit(1000),
    db
      .from("organization_members")
      .select("*,profiles(*)", { count: "exact" })
      .eq("organization_id", organization.id)
      .order("created_at")
      .limit(1000),
  ]);
  for (const result of [clients, projects, members]) {
    if (result.error) throw new Error("Unable to load workspace directory.");
    if ((result.count ?? 0) > 1000)
      throw new Error(
        "Workspace directory exceeds the Phase 2 limit of 1,000 entries.",
      );
  }
  return {
    clients: clients.data ?? [],
    projects: projects.data ?? [],
    members: members.data ?? [],
  };
});
export type Directory = Awaited<ReturnType<typeof directories>>;

const matchingDefinitionIds = cache(async (search: string) => {
  const { db, organization } = await requireWorkspace();
  const ids: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("service_deliverables")
      .select("id")
      .eq("organization_id", organization.id)
      .ilike("name", taskSearchPattern(search))
      .order("id")
      .range(offset, offset + 999);
    if (result.error) throw new Error("Unable to search deliverable names.");
    ids.push(...result.data.map((definition) => definition.id));
    if (result.data.length < 1000) break;
  }
  return ids;
});
export async function taskList({
  page = 1,
  status,
  priority,
  assignee,
  project,
  client,
  upcoming = false,
  deliverablesOnly = false,
  limit = 25,
  view,
  q,
  due,
  sort,
}: {
  page?: number;
  status?: string;
  priority?: string;
  assignee?: string;
  project?: string;
  client?: string;
  upcoming?: boolean;
  deliverablesOnly?: boolean;
  limit?: number;
  view?: string;
  q?: string;
  due?: string;
  sort?: string;
} = {}) {
  const { db, organization, user } = await requireWorkspace();
  const filters = normalizeTaskFilters({
    status,
    priority,
    assignee,
    project,
    client,
    view,
    q,
    due,
    sort,
  });
  // Filter a separate embed so every assignee is still shown in each result.
  const fields =
    deliverablesOnly
      ? "*,projects!inner(name,status),clients(name),service_deliverables(name,cadence),task_assignees(user_id),assigned:task_assignees(user_id)" as const
      : "*,projects(name,status),clients(name),service_deliverables(name,cadence),task_assignees(user_id),assigned:task_assignees(user_id)" as const;
  let query = db
    .from("tasks")
    .select(fields, { count: "exact" })
    .eq("organization_id", organization.id);
  // The Tasks workspace shows actionable service deliverables only.
  // Other task records remain available to other views and are never deleted.
  if (deliverablesOnly) query = query.eq("projects.status", "active");
  const { today, monday, sunday } = workspaceCalendar();
  const monthScope = deliverablesOnly
    ? activeDeliverableTaskScope()
    : filters.view !== "history" ? monthTaskScope() : "";
  const searchScope = filters.q
    ? taskSearchScope(filters.q, await matchingDefinitionIds(filters.q))
    : "";
  const scope = combineTaskScopes(monthScope, searchScope);
  if (scope) query = query.or(scope);
  const parsedStatus = z.enum(taskStatuses).safeParse(status);
  const parsedPriority = z.enum(priorities).safeParse(priority);
  if (parsedStatus.success) query = query.eq("status", parsedStatus.data);
  if (parsedPriority.success) query = query.eq("priority", parsedPriority.data);
  const selectedAssignee = filters.view === "mine" ? user.id : filters.assignee;
  if (filters.view === "unassigned") query = query.is("assigned", null);
  else if (selectedAssignee)
    query = query
      .eq("assigned.user_id", selectedAssignee)
      .not("assigned", "is", null);
  if (filters.project) query = query.eq("project_id", filters.project);
  if (filters.client) query = query.eq("client_id", filters.client);
  if (["mine", "overdue", "unassigned"].includes(filters.view))
    query = query.not("status", "in", "(done,cancelled)");
  if (filters.view === "overdue" || filters.due === "overdue")
    query = query.lt("due_date", today).not("status", "in", "(done,cancelled)");
  else if (filters.due === "today") query = query.eq("due_date", today);
  else if (filters.due === "week")
    query = query.gte("due_date", monday).lte("due_date", sunday);
  else if (filters.due === "undated") query = query.is("due_date", null);
  if (upcoming) query = query.not("status", "in", "(done,cancelled)");
  if (filters.sort === "newest" || filters.sort === "oldest")
    query = query.order("created_at", { ascending: filters.sort === "oldest" });
  else if (filters.sort === "title") query = query.order("title");
  else query = query.order("due_date", { ascending: true, nullsFirst: false });
  if (filters.sort !== "newest" && filters.sort !== "oldest")
    query = query.order("created_at", { ascending: false });
  const safePage =
    Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1;
  const result = await query
    .order("id")
    .range((safePage - 1) * limit, safePage * limit - 1);
  if (result.error) throw new Error("Unable to load tasks.");
  return { rows: result.data ?? [], count: result.count ?? 0 };
}

// Group the entire matching set. Pagination of individual rows would scatter a
// client's services across pages and make group totals misleading.
export async function taskListAll(
  filters: Parameters<typeof taskList>[0] = {},
) {
  const first = await taskList({ ...filters, page: 1, limit: 1000 });
  const extraPages = Math.max(0, Math.ceil(first.count / 1000) - 1);
  const rest = await Promise.all(
    Array.from({ length: extraPages }, (_, index) =>
      taskList({ ...filters, page: index + 2, limit: 1000 }),
    ),
  );
  return {
    rows: [...first.rows, ...rest.flatMap((result) => result.rows)],
    count: first.count,
  };
}
export async function taskDetail(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, organization } = await requireWorkspace();
  const { data, error } = await db
    .from("tasks")
    .select(
      "*,projects(name),clients(name),service_deliverables(name,cadence),task_assignees(user_id)",
    )
    .eq("organization_id", organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load task.");
  if (!data) notFound();
  return data;
}
export async function activity(page = 1, limit = 25, thisMonth = false) {
  const { db, organization } = await requireWorkspace();
  let query = db
    .from("activity_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id);
  if (thisMonth) {
    const month = workspaceMonth();
    query = query
      .gte("created_at", month.startedAt)
      .lt("created_at", month.endedAt);
  }
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw new Error("Unable to load recent activity.");
  return { rows: data ?? [], count: count ?? 0 };
}
export async function dashboardCounts() {
  const { db, user, organization } = await requireWorkspace();
  // Business calendar: Africa/Johannesburg, Monday–Sunday; dates are not timestamps.
  const { today, monday, sunday } = workspaceCalendar();
  const myTasks = () =>
    db
      .from("tasks")
      .select("id,projects!inner(status),task_assignees!inner(user_id)", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", organization.id)
      .eq("projects.status", "active")
      .or(activeDeliverableTaskScope())
      .eq("task_assignees.user_id", user.id)
      .not("status", "in", "(done,cancelled)");
  const results = await Promise.all([
    myTasks(),
    myTasks().gte("due_date", monday).lte("due_date", sunday),
    myTasks().lt("due_date", today),
    db
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("status", "active"),
  ]);
  if (results.some((r) => r.error))
    throw new Error("Unable to load dashboard totals.");
  return results.map((r) => r.count ?? 0);
}

// Responsibilities live in their own table and never contribute to task totals.
export async function taskStatusCounts() {
  const { db, organization } = await requireWorkspace();
  const statuses = taskStatuses;
  return Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await db
        .from("tasks")
        .select("id,projects!inner(status)", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("projects.status", "active")
        .or(activeDeliverableTaskScope())
        .eq("status", status);
      if (error) throw new Error("Unable to load task status overview.");
      return { status, count: count ?? 0 };
    }),
  );
}

// Exact counts avoid silently truncating a client's progress at a row limit.
export const clientWorkSummary = cache(async (clientId: string) => {
  const { db, organization } = await requireWorkspace();
  const { today } = workspaceCalendar();
  const base = () =>
    db
      .from("tasks")
      .select("id,projects!inner(status)", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("client_id", clientId)
      .eq("projects.status", "active")
      .or(activeDeliverableTaskScope());
  const [total, done, overdue, review, services] = await Promise.all([
    base().neq("status", "cancelled"),
    base().eq("status", "done"),
    base().not("status", "in", "(done,cancelled)").lt("due_date", today),
    base().eq("status", "review"),
    db
      .from("projects")
      .select("id,name,service_templates(name)")
      .eq("organization_id", organization.id)
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("name"),
  ]);
  if ([total, done, overdue, review, services].some((result) => result.error))
    throw new Error("Unable to load client work summary.");
  return {
    total: total.count ?? 0,
    done: done.count ?? 0,
    outstanding: (total.count ?? 0) - (done.count ?? 0),
    overdue: overdue.count ?? 0,
    review: review.count ?? 0,
    services: services.data ?? [],
  };
});
