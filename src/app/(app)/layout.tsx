import { AppShell } from "@/components/app-shell";
import { workspaceOptions } from "@/lib/data/workspace";
import { cookies } from "next/headers";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, organizations, db } = await workspaceOptions();
  const { data: profile } = await db.from("profiles").select("full_name,avatar_url,updated_at").eq("id", user.id).maybeSingle();
  const selected = (await cookies()).get("peak-workspace")?.value;
  const organization =
    organizations.find((o) => o.id === selected) ?? organizations[0];
  const help = organization ? await db.from("help_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).neq("status", "resolved") : null;
  return (
    <AppShell
      email={user.email ?? "Team member"}
      workspaceName={organization?.name}
      fullName={profile?.full_name ?? undefined}
      avatarUrl={profile?.avatar_url ?? undefined}
      avatarUpdatedAt={profile?.updated_at}
      helpCount={help?.error ? null : help?.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
