import { redirect } from "next/navigation";
import { workspaceOptions } from "@/lib/data/workspace";
import { EmptyState } from "@/components/empty-state";
export default async function WorkspaceSetup() {
  const { memberships } = await workspaceOptions();
  if (memberships.length) redirect("/dashboard");
  return (
    <section className="panel">
      <EmptyState icon="team" title="Your account is ready">
        You haven’t been added to a workspace yet. Ask your Peak Leads
        administrator to add your account, then refresh this page.
      </EmptyState>
    </section>
  );
}
