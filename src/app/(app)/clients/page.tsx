import { ClientServicesEditor } from "@/components/work/client-services-editor";
import { clientWorkSummary } from "@/lib/data/queries";
import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
  SelectField,
} from "@/components/work/shared";
import { EmptyState } from "@/components/empty-state";
import { clientStatuses, label } from "@/lib/data/constants";
import { taskSearchPattern } from "@/lib/data/task-filters";
export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const status = clientStatuses.find((value) => value === filters.status);
  const q = typeof filters.q === "string" ? filters.q.trim().slice(0, 120) : "";
  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  const { db, organization, canAdmin } = await requireWorkspace();
  let clientQuery = db
    .from("clients")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id);
  if (status) clientQuery = clientQuery.eq("status", status);
  if (q) clientQuery = clientQuery.ilike("name", taskSearchPattern(q));
  const { data, count, error } = await clientQuery
    .order("name")
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load clients.");
  const [summaries, linkedServices] = await Promise.all([
    Promise.all(data.map((c) => clientWorkSummary(c.id))),
    db.from("projects").select("id,name,status,client_id,service_templates(name)")
      .eq("organization_id", organization.id).in("client_id", data.map((c) => c.id).length ? data.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"])
      .not("service_template_id", "is", null).order("name"),
  ]);
  if (linkedServices.error) throw new Error("Unable to load client service settings.");
  return (
    <>
      <PageHeading
        title="Clients"
        description="Choose a client to see their packages, deliverables and progress."
        href={canAdmin ? "/clients/new" : undefined}
        action="Create client"
      />
      <form
        key={query.toString()}
        action="/clients"
        className="filter-bar"
        aria-label="Filter clients"
      >
        <label>
          Search clients
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search client names…"
            maxLength={120}
          />
        </label>
        <SelectField
          name="status"
          title="Status"
          value={status}
          empty="All statuses"
          options={clientStatuses.map((value) => ({
            value,
            label: label(value),
          }))}
        />
        <button className="button secondary">Apply filters</button>
        {(status || q) && (
          <Link className="text-link" href="/clients">
            Clear filters
          </Link>
        )}
      </form>
      <section className="panel">
        {data.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Clients table"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Active packages / services</th>
                  <th>Task progress</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c, index) => (
                  <tr key={c.id}>
                    <td>
                      <Link className="record-link" href={`/clients/${c.id}`}>
                        {c.name}
                      </Link>
                      <small>{c.slug}</small>
                    </td>
                    <td>
                      <Badge value={c.status} />
                    </td>
                    <td>
                      <ClientServicesEditor
                        clientId={c.id}
                        canAdmin={canAdmin}
                        services={(linkedServices.data ?? []).filter(service => service.client_id === c.id)
                          .map(service => ({ id: service.id, name: service.service_templates?.name || service.name, status: service.status }))}
                      />
                    </td>
                    <td>
                      {summaries[index].done} / {summaries[index].total} done
                      <small>This month · Cancelled excluded</small>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/tasks?client=${c.id}`}
                      >
                        {summaries[index].outstanding} outstanding
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon="clients"
            title={status || q ? "No matching clients" : "No clients yet"}
          >
            {status || q
              ? "Clear filters or try a different name."
              : "An owner or admin can add your first client."}
          </EmptyState>
        )}
        <Pagination page={page} count={count ?? 0} href={`/clients?${query}`} />
      </section>
    </>
  );
}
