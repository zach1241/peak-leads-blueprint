import { AppShell } from "@/components/app-shell";
import { workspaceOptions } from "@/lib/data/workspace";
import { cookies } from "next/headers";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, organizations, db } = await workspaceOptions();
  const { data: profile } = await db.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle();
  const selected = (await cookies()).get("peak-workspace")?.value;
  const organization =
    organizations.find((o) => o.id === selected) ?? organizations[0];
  return (
    <AppShell
      email={user.email ?? "Team member"}
      workspaceName={organization?.name}
      fullName={profile?.full_name ?? undefined}
      avatarUrl={profile?.avatar_url ?? undefined}
    >
      {children}
    </AppShell>
  );
}
