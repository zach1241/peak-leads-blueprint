import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
} from "@/components/work/shared";
import { EmptyState } from "@/components/empty-state";
export default async function Clients({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const { db, organization, canAdmin } = await requireWorkspace();
  const { data, count, error } = await db
    .from("clients")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("name")
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load clients.");
  return (
    <>
      <PageHeading
        title="Clients"
        description="Your relationships, with the details close at hand."
        href={canAdmin ? "/clients/new" : undefined}
        action="Create client"
      />
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
                  <th>Primary contact</th>
                  <th>Website</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
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
                      {c.primary_contact_name || "Not added"}
                      <small>{c.primary_contact_email}</small>
                    </td>
                    <td>
                      {c.website ? (
                        <a
                          className="text-link"
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visit website ↗
                        </a>
                      ) : (
                        "Not added"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="clients" title="No clients yet">
            An owner or admin can add your first client.
          </EmptyState>
        )}
        <Pagination page={page} count={count ?? 0} href="/clients" />
      </section>
    </>
  );
}
