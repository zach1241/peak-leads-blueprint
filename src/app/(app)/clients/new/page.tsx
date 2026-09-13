import { requireWorkspace } from "@/lib/data/workspace";
import { ClientForm } from "@/components/work/forms";
import { PageHeading } from "@/components/work/shared";
export default async function NewClient() {
  const { canAdmin } = await requireWorkspace();
  return (
    <>
      <PageHeading
        title="Create client"
        description="Keep a clear record of who you work with."
      />
      <section className="panel form-panel">
        {canAdmin ? (
          <ClientForm />
        ) : (
          <p>Only owners and admins can create clients.</p>
        )}
      </section>
    </>
  );
}
