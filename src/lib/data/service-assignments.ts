import "server-only";
import { cache } from "react";
import { requireWorkspace } from "./workspace";

export type ServiceAssignmentOption = {
  id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  eligible_tasks: number;
  default_configured: boolean;
  default_assignees: string[];
};

export const serviceAssignmentOptions = cache(async (): Promise<ServiceAssignmentOption[]> => {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) return [];
  const [projects, counts] = await Promise.all([
    db.from("projects").select("id,name,client_id,clients(name)", { count: "exact" })
      .eq("organization_id", organization.id).order("name").limit(1000),
    db.rpc("service_assignment_options", { p_organization_id: organization.id }),
  ]);
  if (projects.error || counts.error) throw new Error("Unable to load service assignments.");
  if ((projects.count ?? 0) > 1000) throw new Error("Service assignment directory exceeds 1,000 services.");
  const summaries = new Map((counts.data ?? []).map((row) => [row.project_id, row]));
  return (projects.data ?? []).map((project) => {
    const summary = summaries.get(project.id);
    return {
      id: project.id,
      name: project.name,
      client_id: project.client_id,
      client_name: project.clients?.name ?? null,
      eligible_tasks: Number(summary?.eligible_tasks ?? 0),
      default_configured: summary?.default_configured ?? false,
      default_assignees: summary?.default_assignees ?? [],
    };
  });
});
