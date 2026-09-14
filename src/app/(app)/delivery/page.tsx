import Link from "next/link";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { PageHeading, Badge } from "@/components/work/shared";
import { DeliveryGenerator } from "@/components/work/delivery-generator";
export default async function Delivery({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { db, organization, canAdmin } = await requireWorkspace();
  const filter = (await searchParams).client;
  const client = z.uuid().safeParse(filter).success ? filter : undefined;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  let tasksQuery = db
    .from("tasks")
    .select(
      "*,clients(name),projects(name),service_deliverables(cadence,name)",
      { count: "exact" },
    )
    .eq("organization_id", organization.id)
    .not("deliverable_definition_id", "is", null)
    .gte("contract_end", today)
    .lte("contract_start", today)
    .order("contract_end")
    .order("title")
    .limit(1000);
  if (client) {
    tasksQuery = tasksQuery.eq("client_id", client);
  }
  const [tasks, clients] = await Promise.all([
    tasksQuery,
    db
      .from("clients")
      .select("id,name")
      .eq("organization_id", organization.id)
      .order("name")
      .limit(1000),
  ]);
  if (tasks.error || clients.error)
    throw new Error("Unable to load service delivery.");
  if ((tasks.count ?? 0) > 1000)
    throw new Error("Delivery view exceeds 1,000 records. Filter by client.");
  const grouped = new Map<string, { task: (typeof tasks.data)[number]; delivered: number; minimum: number; maximum: number; count: number; statuses: string[] }>();
  for (const task of tasks.data) {
    const key = [task.project_id, task.deliverable_definition_id, task.contract_start, task.contract_end].join(":");
    const group = grouped.get(key) ?? { task, delivered: 0, minimum: 0, maximum: 0, count: 0, statuses: [] };
    group.delivered += task.completed_quantity; group.minimum += task.target_min ?? 0; group.maximum += task.target_max ?? 0; group.count++; group.statuses.push(task.status);
    grouped.set(key, group);
  }
  const contracts = [...grouped.values()].map(group => ({ ...group.task, completed_quantity: group.delivered, target_min: group.minimum, target_max: group.maximum, period_start: group.task.contract_start, period_end: group.task.contract_end, workCount: group.count,
    status: group.delivered >= group.minimum ? "done" : group.statuses.includes("review") ? "review" : group.delivered > 0 || group.statuses.includes("in_progress") ? "in_progress" : "todo" }));
  return (
    <>
      <PageHeading
        title="Service delivery"
        description="Quantity delivered against each current contractual target."
      />
      {canAdmin && <DeliveryGenerator />}
      <form className="delivery-filter">
        <label>
          Client
          <select name="client" defaultValue={client ?? ""}>
            <option value="">All clients</option>
            {clients.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Filter</button>
      </form>
      <p className="data-note">
        Africa/Johannesburg calendar. Monthly work covers the current month;
        weekly work covers the current Monday–Sunday. Targets use the supplied
        quantities. Backlink ranges are met at the minimum of two; the full
        range remains visible.
      </p>
      {(["monthly", "weekly"] as const).map((cadence) => {
        const rows = contracts.filter(
          (t) => t.service_deliverables?.cadence === cadence,
        );
        const met = rows.filter(
          (t) => t.completed_quantity >= (t.target_min ?? Infinity),
        ).length;
        return (
          <section className="panel section-gap" key={cadence}>
            <div className="panel-heading">
              <h2>
                {cadence === "monthly"
                  ? "Monthly deliverables"
                  : "Actionable week"}
              </h2>
              <span>
                {met} / {rows.length} targets met
              </span>
            </div>
            <div
              className="table-scroll"
              role="region"
              aria-label={`${cadence} deliverables`}
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Deliverable</th>
                    <th>Client / service</th>
                    <th>Delivered / target</th>
                    <th>Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/tasks?client=${t.client_id}`}>
                          {t.service_deliverables?.name}
                        </Link>
                        <small>View client work</small>
                      </td>
                      <td>
                        {t.clients?.name}
                        <br />
                        <span className="muted">{t.projects?.name}</span>
                      </td>
                      <td>
                        {t.completed_quantity} / {t.target_min}
                        {t.target_max !== t.target_min
                          ? `–${t.target_max}`
                          : ""}{" "}
                        {t.target_unit}
                      </td>
                      <td>
                        {t.period_start}
                        <br />
                        {t.period_end}
                      </td>
                      <td>
                        <Badge value={t.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="data-note">
                No deliverables for this period. Check periods to generate work
                for active services.
              </p>
            )}
          </section>
        );
      })}

    </>
  );
}
