import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
} from "@/components/work/shared";
import { displayDate } from "@/lib/data/constants";
import { EmptyState } from "@/components/empty-state";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = pageNumber((await searchParams).page);
  const { db, organization } = await requireWorkspace();
  const { data, count, error } = await db
    .from("projects")
    .select("*,clients(name)", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load projects.");
  return (
    <>
      <PageHeading
        title="Projects"
        description="Connect the daily work to the bigger picture."
        href="/projects/new"
        action="Create project"
      />
      <section className="panel">
        {data.length ? (
          <div
            className="table-scroll"
            role="region"
            aria-label="Projects table"
            tabIndex={0}
          >
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="record-link" href={`/projects/${p.id}`}>
                        {p.name}
                      </Link>
                    </td>
                    <td>{p.clients?.name ?? "No client"}</td>
                    <td>
                      <Badge value={p.status} />
                    </td>
                    <td>{displayDate(p.due_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon="projects" title="No projects yet">
            Create a project to bring related work together.
          </EmptyState>
        )}
        <Pagination page={page} count={count ?? 0} href="/projects" />
      </section>
    </>
  );
}
