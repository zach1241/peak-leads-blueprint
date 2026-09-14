import { requireWorkspace } from "@/lib/data/workspace";
import { redirect } from "next/navigation";
import { directories } from "@/lib/data/queries";
import { TaskForm } from "@/components/work/forms";
import { PageHeading } from "@/components/work/shared";
export default async function NewTask() {
  if (!(await requireWorkspace()).canAdmin) redirect("/tasks");
  return (
    <>
      <PageHeading
        title="Create task"
        description="Give the next step a clear owner and deadline."
      />
      <section className="panel form-panel">
        <TaskForm directory={await directories()} />
      </section>
    </>
  );
}
