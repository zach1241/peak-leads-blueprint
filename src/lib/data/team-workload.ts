import "server-only";
import { requireWorkspace } from "./workspace";
import { directories } from "./queries";
export async function teamWorkload() {
  const { db, organization } = await requireWorkspace();
  const directory = await directories();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(1);
  const start = date.toISOString().slice(0, 10); date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCDate(0);
  const end = date.toISOString().slice(0, 10);
  const counts = new Map(directory.members.map(member => [member.user_id, { total: 0, done: 0, review: 0, overdue: 0 }]));
  let unassigned = 0;
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("tasks").select("id,status,due_date,period_start,period_end,task_assignees(user_id)")
      .eq("organization_id", organization.id).neq("status", "cancelled")
      .or(`and(period_start.lte.${end},period_end.gte.${start}),and(due_date.gte.${start},due_date.lte.${end})`).order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Unable to load monthly team work.");
    for (const task of result.data) {
      if (!task.task_assignees.length) unassigned++;
      for (const assignment of task.task_assignees) {
        const count = counts.get(assignment.user_id); if (!count) continue;
        count.total++; if (task.status === "done") count.done++;
        if (task.status === "review") count.review++;
        if (task.status !== "done" && task.due_date && task.due_date < today) count.overdue++;
      }
    }
    if (result.data.length < 1000) break;
  }
  return { start, end, unassigned, members: directory.members.map(member => ({ id: member.user_id, name: member.profiles?.full_name || "Team member", avatar: member.profiles?.avatar_url, ...counts.get(member.user_id)! })) };
}
