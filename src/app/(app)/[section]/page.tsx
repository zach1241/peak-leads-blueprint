import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { navigation } from "@/lib/navigation";
import { EmptyState } from "@/components/empty-state";
const descriptions: Record<string, string> = {
  tasks: "A focused place to plan, assign, and follow through.",
  clients: "Keep your client relationships and their work together.",
  projects: "Connect daily work to the bigger picture.",
  team: "The people moving Peak Leads forward.",
  activity: "A shared view of what’s happening across your team.",
  settings: "Your account and workspace preferences.",
};
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const user = await requireUser();
  const { section } = await params;
  const item = navigation.find(
    (item) => item.href === `/${section}` && item.href !== "/dashboard",
  );
  if (!item) notFound();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">WORKSPACE</span>
          <h1>{item.label}</h1>
          <p>{descriptions[section]}</p>
        </div>
        <span className="workspace-badge">Coming in Phase 2</span>
      </div>
      <section className="panel placeholder-panel">
        <EmptyState icon={item.icon} title={`${item.label}, with room to grow`}>
          This area is ready for the next phase. Your workspace’s{" "}
          {item.label.toLowerCase()} tools will be available here.
        </EmptyState>
        {section === "settings" && (
          <p className="settings-email">
            Signed in as <strong>{user.email}</strong>
          </p>
        )}
        <Link href="/dashboard" className="button secondary">
          Back to dashboard
        </Link>
      </section>
    </>
  );
}
