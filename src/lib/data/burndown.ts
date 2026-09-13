import "server-only";
import { requireWorkspace } from "./workspace";
import type { Json, Database } from "@/lib/database.types";
const dateInWorkspace = (date: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));
function loggedStatus(metadata: Json) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) && typeof metadata.status === "string" ? metadata.status : null;
}
export async function currentMonthBurndown() {
  const { db, organization } = await requireWorkspace();
  const today = dateInWorkspace(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${today.slice(0, 7)}-01`;
  const end = `${today.slice(0, 7)}-${days}`;
  const tasks: Pick<Database["public"]["Tables"]["tasks"]["Row"], "id" | "status" | "created_at">[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("tasks").select("id,status,created_at")
      .eq("organization_id", organization.id).neq("status", "cancelled")
      .or(`and(period_start.lte.${end},period_end.gte.${start}),and(period_start.is.null,due_date.gte.${start},due_date.lte.${end})`)
      .order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Unable to load monthly task scope.");
    tasks.push(...result.data); if (result.data.length < 1000) break;
  }
  const events: Pick<Database["public"]["Tables"]["activity_logs"]["Row"], "entity_id" | "action" | "metadata" | "created_at">[] = [];
  for (let batch = 0; batch < tasks.length; batch += 100) {
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from("activity_logs").select("entity_id,action,metadata,created_at")
        .eq("organization_id", organization.id).eq("entity_type", "task")
        .in("entity_id", tasks.slice(batch, batch + 100).map(task => task.id))
        .in("action", ["completed", "burndown_baseline", "status_changed"])
        .order("created_at").order("id").range(offset, offset + 999);
      if (result.error) throw new Error("Unable to load task completion history.");
      events.push(...result.data); if (result.data.length < 1000) break;
    }
  }
  const histories = new Map(tasks.map(task => [task.id, events.filter(event => event.entity_id === task.id)]));
  const actual = Array.from({ length: day }, (_, i) => {
    const date = `${today.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
    let remaining = 0;
    for (const task of tasks) {
      if (dateInWorkspace(task.created_at) > date) continue;
      const history = histories.get(task.id) ?? [];
      const latest = history.filter(event => loggedStatus(event.metadata) && dateInWorkspace(event.created_at) <= date).at(-1);
      // A baseline observes a status now; it cannot tell us what happened earlier.
      if (!latest) return { day: i + 1, remaining: null };
      if (!["done", "cancelled"].includes(loggedStatus(latest.metadata)!)) remaining++;
    }
    return { day: i + 1, remaining };
  });
  const completedThisMonth = tasks.filter(task => {
    if (task.status !== "done") return false;
    const completion = (histories.get(task.id) ?? []).filter(event => event.action === "completed" || (event.action === "status_changed" && loggedStatus(event.metadata) === "done")).at(-1);
    return completion && dateInWorkspace(completion.created_at) >= start && dateInWorkspace(completion.created_at) <= today;
  }).length;
  return { month: new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "Africa/Johannesburg" }).format(new Date()), days, total: tasks.length,
    remaining: tasks.filter(task => task.status !== "done").length, completedThisMonth, actual };
}
