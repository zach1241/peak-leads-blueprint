import { requireWorkspace } from "@/lib/data/workspace";
import { redirect } from "next/navigation";
import { directories } from "@/lib/data/queries";
import { TaskForm } from "@/components/work/forms";
import { PageHeading } from "@/components/work/shared";
import Link from "next/link";
export default async function NewTask({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; client?: string }>;
}) {
  if (!(await requireWorkspace()).canAdmin) redirect("/tasks");
  const directory = await directories();
  const filters = await searchParams;
  const project = directory.projects.find((p) => p.id === filters.project);
  const client = directory.clients.find(
    (c) => c.id === (project?.client_id ?? filters.client),
  );
  return (
    <>
      <Link
        href={project ? `/projects/${project.id}` : "/tasks"}
        className="back-link"
      >
        ← {project ? "Back to project" : "All tasks"}
      </Link>
      <PageHeading
        title="Create task"
        description="Give the next step a clear owner and deadline."
      />
      <section className="panel form-panel">
        <TaskForm
          directory={directory}
          initialProjectId={project?.id}
          initialClientId={client?.id}
        />
      </section>
    </>
  );
}
