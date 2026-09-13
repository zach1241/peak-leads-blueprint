import "server-only";
import { cache } from "react";
import { z } from "zod";
import { notFound } from "next/navigation";
import { requireWorkspace } from "./workspace";
import { priorities, taskStatuses } from "./constants";
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
      .select("id,name,client_id", { count: "exact" })
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
export async function taskList({
  page = 1,
  status,
  priority,
  assignee,
  project,
  client,
  upcoming = false,
  limit = 25,
}: {
  page?: number;
  status?: string;
  priority?: string;
  assignee?: string;
  project?: string;
  client?: string;
  upcoming?: boolean;
  limit?: number;
} = {}) {
  const { db, organization } = await requireWorkspace();
  // Filter a separate embed so every assignee is still shown in each result.
  const fields =
    "*,projects(name),clients(name),task_assignees(user_id),assigned:task_assignees(user_id)" as const;
  let query = db
    .from("tasks")
    .select(fields, { count: "exact" })
    .eq("organization_id", organization.id);
  const parsedStatus = z.enum(taskStatuses).safeParse(status);
  const parsedPriority = z.enum(priorities).safeParse(priority);
  if (parsedStatus.success) query = query.eq("status", parsedStatus.data);
  if (parsedPriority.success) query = query.eq("priority", parsedPriority.data);
  if (assignee && z.uuid().safeParse(assignee).success)
    query = query.eq("assigned.user_id", assignee).not("assigned", "is", null);
  if (project) query = query.eq("project_id", project);
  if (client) query = query.eq("client_id", client);
  if (upcoming) query = query.not("status", "in", "(done,cancelled)");
  const result = await query
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * limit, page * limit - 1);
  if (result.error) throw new Error("Unable to load tasks.");
  return { rows: result.data ?? [], count: result.count ?? 0 };
}
export async function taskDetail(id: string) {
  if (!z.uuid().safeParse(id).success) notFound();
  const { db, organization } = await requireWorkspace();
  const { data, error } = await db
    .from("tasks")
    .select("*,task_assignees(user_id)")
    .eq("organization_id", organization.id)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Unable to load task.");
  if (!data) notFound();
  return data;
}
export async function activity(page = 1, limit = 25) {
  const { db, organization } = await requireWorkspace();
  const { data, error, count } = await db
    .from("activity_logs")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * limit, page * limit - 1);
  if (error) throw new Error("Unable to load recent activity.");
  return { rows: data ?? [], count: count ?? 0 };
}
export async function dashboardCounts() {
  const { db, user, organization } = await requireWorkspace();
  // Business calendar: Africa/Johannesburg, Monday–Sunday; dates are not timestamps.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const myTasks = () =>
    db
      .from("tasks")
      .select("id,task_assignees!inner(user_id)", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", organization.id)
      .eq("task_assignees.user_id", user.id)
      .not("status", "in", "(done,cancelled)");
  const results = await Promise.all([
    myTasks(),
    myTasks()
      .gte("due_date", monday.toISOString().slice(0, 10))
      .lte("due_date", sunday.toISOString().slice(0, 10)),
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
