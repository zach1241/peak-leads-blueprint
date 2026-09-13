import { AppShell } from "@/components/app-shell";
import { workspaceOptions } from "@/lib/data/workspace";
import { cookies } from "next/headers";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, organizations } = await workspaceOptions();
  const selected = (await cookies()).get("peak-workspace")?.value;
  const organization =
    organizations.find((o) => o.id === selected) ?? organizations[0];
  return (
    <AppShell
      email={user.email ?? "Team member"}
      workspaceName={organization?.name}
    >
      {children}
    </AppShell>
  );
}
