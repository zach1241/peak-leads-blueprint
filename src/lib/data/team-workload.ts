import "server-only";
import { requireWorkspace } from "./workspace";
import { directories } from "./queries";
import {
  activeDeliverableTaskScope,
  workspaceCalendar,
  workspaceMonth,
} from "./task-filters";
export async function teamWorkload() {
  const { db, organization } = await requireWorkspace();
  const directory = await directories();
  const { today } = workspaceCalendar();
  const month = workspaceMonth();
  const counts = new Map(
    directory.members.map((member) => [
      member.user_id,
      { total: 0, done: 0, cancelled: 0, review: 0, overdue: 0 },
    ]),
  );
  let unassigned = 0;
  for (let offset = 0; ; offset += 1000) {
    const result = await db
      .from("tasks")
      .select(
        "id,status,due_date,period_start,period_end,projects!inner(status),task_assignees(user_id)",
      )
      .eq("organization_id", organization.id)
      .eq("projects.status", "active")
      .or(activeDeliverableTaskScope(month))
      .order("id")
      .range(offset, offset + 999);
    if (result.error) throw new Error("Unable to load monthly team work.");
    for (const task of result.data) {
      if (
        !task.task_assignees.length &&
        !["done", "cancelled"].includes(task.status)
      )
        unassigned++;
      for (const assignment of task.task_assignees) {
        const count = counts.get(assignment.user_id);
        if (!count) continue;
        count.total++;
        if (task.status === "done") count.done++;
        if (task.status === "cancelled") count.cancelled++;
        if (task.status === "review") count.review++;
        if (
          !["done", "cancelled"].includes(task.status) &&
          task.due_date &&
          task.due_date < today
        )
          count.overdue++;
      }
    }
    if (result.data.length < 1000) break;
  }
  return {
    start: month.start,
    end: month.end,
    month: month.label,
    unassigned,
    members: directory.members.map((member) => ({
      id: member.user_id,
      name: member.profiles?.full_name || "Team member",
      avatar: member.profiles?.avatar_url,
      ...counts.get(member.user_id)!,
    })),
  };
}
