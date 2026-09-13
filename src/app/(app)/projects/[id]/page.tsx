import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { directories, taskList } from "@/lib/data/queries";
import { ProjectForm } from "@/components/work/forms";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
} from "@/components/work/shared";
import { TaskTable } from "@/components/work/task-table";
export default async function Project({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const page = pageNumber((await searchParams).page);
  const { db, organization } = await requireWorkspace();
  const [record, directory, tasks] = await Promise.all([
    db
      .from("projects")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("id", id)
      .maybeSingle(),
    directories(),
    taskList({ project: id, page }),
  ]);
  if (record.error) throw new Error("Unable to load project details.");
  if (!record.data) notFound();
  return (
    <>
      <Link href="/projects" className="back-link">
        ← All projects
      </Link>
      <PageHeading
        title={record.data.name}
        description="Project details and related tasks."
      />
      <div className="detail-badges">
        <Link
          className="text-link"
          href={`/delivery?client=${record.data.client_id ?? ""}`}
        >
          Delivery & responsibilities →
        </Link>
        <Badge value={record.data.status} />
        {record.data.client_id && (
          <Link
            className="text-link"
            href={`/clients/${record.data.client_id}`}
          >
            View client →
          </Link>
        )}
      </div>
      <section className="panel form-panel">
        <ProjectForm project={record.data} directory={directory} />
      </section>
      <section className="panel section-gap">
        <div className="panel-heading">
          <h2>Related tasks ({tasks.count})</h2>
          <Link className="text-link" href="/tasks/new">
            Create task →
          </Link>
        </div>
        <TaskTable tasks={tasks.rows} members={directory.members} />
        <Pagination page={page} count={tasks.count} href={`/projects/${id}`} />
      </section>
    </>
  );
}
