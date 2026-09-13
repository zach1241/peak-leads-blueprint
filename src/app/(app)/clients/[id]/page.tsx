import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { directories, taskList } from "@/lib/data/queries";
import { ClientForm } from "@/components/work/forms";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
} from "@/components/work/shared";
import { TaskTable } from "@/components/work/task-table";
export default async function Client({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const page = pageNumber((await searchParams).page);
  const { db, organization, canAdmin } = await requireWorkspace();
  const [record, directory, tasks, projects] = await Promise.all([
    db
      .from("clients")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .maybeSingle(),
    directories(),
    taskList({ client: id, page }),
    db
      .from("projects")
      .select("id,name,status", { count: "exact" })
      .eq("organization_id", organization.id)
      .eq("client_id", id)
      .order("name")
      .limit(25),
  ]);
  if (record.error || projects.error)
    throw new Error("Unable to load client details.");
  if (!record.data) notFound();
  const client = record.data;
  return (
    <>
      <Link href="/clients" className="back-link">
        ← All clients
      </Link>
      <PageHeading
        title={client.name}
        description="Client details and associated work."
      />
      <div className="detail-badges">
        <Link className="text-link" href={`/delivery?client=${id}`}>
          View deliverables →
        </Link>
        <Badge value={client.status} />
      </div>
      <section className="panel form-panel">
        {canAdmin ? (
          <ClientForm client={client} />
        ) : (
          <dl className="record-details">
            <dt>Primary contact</dt>
            <dd>
              {client.primary_contact_name || "Not added"} ·{" "}
              {client.primary_contact_email || "No email"}
            </dd>
            <dt>Website</dt>
            <dd>
              {client.website ? (
                <a
                  href={client.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {client.website}
                </a>
              ) : (
                "Not added"
              )}
            </dd>
            <dt>Notes</dt>
            <dd>{client.notes || "No notes"}</dd>
          </dl>
        )}
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Projects ({projects.count ?? 0})</h2>
        </div>
        <ul className="record-list">
          {projects.data.length ? (
            projects.data.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`}>{p.name}</Link>
                <Badge value={p.status} />
              </li>
            ))
          ) : (
            <li>No projects linked yet.</li>
          )}
        </ul>
        {(projects.count ?? 0) > 25 && (
          <p className="data-note">Showing the first 25 projects.</p>
        )}
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Directly linked tasks ({tasks.count})</h2>
        </div>
        <TaskTable tasks={tasks.rows} members={directory.members} />
        <Pagination page={page} count={tasks.count} href={`/clients/${id}`} />
      </section>
    </>
  );
}
