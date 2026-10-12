import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { directories, taskList, clientWorkSummary } from "@/lib/data/queries";
import {
  serviceAssignmentOptions,
  serviceTemplates,
} from "@/lib/data/service-assignments";
import { ServiceAssignmentEditor } from "@/components/work/service-assignment-editor";
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
  const [record, directory, tasks, projects, summary, services, templates] =
    await Promise.all([
      db
        .from("clients")
        .select("*")
        .eq("organization_id", organization.id)
        .eq("id", id)
        .maybeSingle(),
      directories(),
      taskList({ client: id, page, deliverablesOnly: true }),
      db
        .from("projects")
        .select("id,name,status,service_template_id", { count: "exact" })
        .eq("organization_id", organization.id)
        .eq("client_id", id)
        .order("name")
        .limit(25),
      clientWorkSummary(id),
      canAdmin ? serviceAssignmentOptions() : Promise.resolve([]),
      canAdmin ? serviceTemplates() : Promise.resolve([]),
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
        description="Packages, deliverables and progress for this client."
      />
      <div className="detail-badges">
        {canAdmin && <Link className="text-link" href={`/delivery?client=${id}`}>
          View deliverables →
        </Link>}
        <Badge value={client.status} />
      </div>
      {canAdmin && (
        <ServiceAssignmentEditor
          organizationId={organization.id}
          services={services.filter((service) => service.client_id === id)}
          members={directory.members}
          clients={directory.clients}
          templates={templates}
          clientId={id}
        />
      )}
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Active services</h2>
        </div>
        <ul className="record-list">
          {projects.data.some(p => p.status === "active" && p.service_template_id) ? (
            projects.data.filter(p => p.status === "active" && p.service_template_id).map((p) => (
              <li key={p.id}>
                {canAdmin ? <Link href={`/projects/${p.id}`}>{p.name}</Link> : <strong>{p.name}</strong>}
                <Badge value={p.status} />
              </li>
            ))
          ) : (
            <li>No active services assigned to this client.</li>
          )}
        </ul>
        {(projects.count ?? 0) > 25 && (
          <p className="data-note">Showing the first 25 projects.</p>
        )}
      </section>
      <p className="data-note section-gap">
        <strong>
          {summary.outstanding} outstanding · {summary.done} / {summary.total}{" "}
          tasks done
        </strong>{" "}
        · This month’s work, excluding cancelled.{" "}
        <Link className="text-link" href={`/tasks?client=${id}`}>
          View this month’s tasks →
        </Link>
      </p>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Tasks / deliverables ({tasks.count})</h2>
        </div>
        <TaskTable tasks={tasks.rows} members={directory.members} />
        <Pagination page={page} count={tasks.count} href={`/clients/${id}`} />
      </section>
      {canAdmin && <details className="panel form-panel section-gap">
        <summary>Client contact details and settings</summary>
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
      </details>}
    </>
  );
}
