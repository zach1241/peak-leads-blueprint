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
  const { db, organization } = await requireWorkspace();
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
    .gte("period_end", today)
    .order("period_end")
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
  return (
    <>
      <PageHeading
        title="Service delivery"
        description="Actionable client deliverables for the current delivery periods."
      />
      <DeliveryGenerator />
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
        weekends prepare the following Monday–Sunday. Targets use the supplied
        quantities. Backlink ranges are met at the minimum of two; the full
        range remains visible.
      </p>
      {(["monthly", "weekly"] as const).map((cadence) => {
        const rows = tasks.data.filter(
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
                        <Link href={`/tasks/${t.id}`}>
                          {t.service_deliverables?.name}
                        </Link>
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
      <p className="data-note section-gap">
        Ongoing responsibilities are reference material.{" "}
        <a className="text-link" href="/documents/peak-leads-client-responsibilities.pdf" download>Download Client Responsibilities</a>
      </p>
    </>
  );
}
