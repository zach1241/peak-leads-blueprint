import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export const workspaceOptions = cache(async () => {
  const user = await requireUser();
  const db = await createClient();
  const { data: memberships, error } = await db
    .from("organization_members")
    .select("*")
    .eq("user_id", user.id);
  if (error)
    throw new Error(
      "Workspace data is unavailable. Check that the Phase 2 migrations have been applied.",
    );
  const { data: organizations, error: orgError } = await db
    .from("organizations")
    .select("*")
    .order("created_at");
  if (orgError) throw new Error("Unable to load workspaces.");
  return {
    user,
    db,
    memberships: memberships ?? [],
    organizations: organizations ?? [],
  };
});
export const requireWorkspace = cache(async () => {
  const context = await workspaceOptions();
  const requested = (await cookies()).get("peak-workspace")?.value;
  const organization =
    context.organizations.find((o) => o.id === requested) ??
    context.organizations[0];
  const membership = context.memberships.find(
    (m) => m.organization_id === organization?.id,
  );
  if (!organization || !membership) redirect("/workspace-setup");
  return {
    ...context,
    organization,
    membership,
    canAdmin: membership.role === "owner" || membership.role === "admin",
  };
});

export async function canUpdateTask(taskId: string) {
  const { db, organization, user, canAdmin } = await requireWorkspace();
  if (canAdmin) return true;
  const { data, error } = await db.from("task_assignees").select("id")
    .eq("organization_id", organization.id).eq("task_id", taskId).eq("user_id", user.id).maybeSingle();
  return !error && Boolean(data);
}
