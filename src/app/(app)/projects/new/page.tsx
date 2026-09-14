import { requireWorkspace } from "@/lib/data/workspace";
import { redirect } from "next/navigation";
import { directories } from "@/lib/data/queries";
import { ProjectForm } from "@/components/work/forms";
import { PageHeading } from "@/components/work/shared";
export default async function NewProject() {
  if (!(await requireWorkspace()).canAdmin) redirect("/projects");
  return (
    <>
      <PageHeading
        title="Create project"
        description="Define the work, timeline, and client."
      />
      <section className="panel form-panel">
        <ProjectForm directory={await directories()} />
      </section>
    </>
  );
}
