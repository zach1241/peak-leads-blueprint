"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";

export async function changeClientServiceStatus(form: FormData): Promise<void> {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) throw new Error("Only owners and admins can edit client services.");
  const parsed = z.object({
    client_id: z.uuid(),
    project_id: z.uuid(),
    status: z.enum(["active", "on_hold"]),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("Invalid service selection.");
  const { client_id, project_id, status } = parsed.data;
  const { data: project, error: lookupError } = await db.from("projects")
    .select("id,service_template_id,service_templates(name)")
    .eq("organization_id", organization.id)
    .eq("client_id", client_id)
    .eq("id", project_id).single();
  if (lookupError || !project) throw new Error("Client service was not found.");
  // Standard and Dominate SEO are mutually exclusive active packages.
  if (status === "active" && ["Standard SEO", "Dominate SEO"].includes(project.service_templates?.name ?? "")) {
    const otherName = project.service_templates?.name === "Standard SEO" ? "Dominate SEO" : "Standard SEO";
    const { data: linked, error: linkedError } = await db.from("projects")
      .select("id,service_templates!inner(name)")
      .eq("organization_id", organization.id)
      .eq("client_id", client_id)
      .eq("status", "active")
      .eq("service_templates.name", otherName);
    if (linkedError) throw new Error("Unable to verify conflicting SEO packages.");
    if (linked?.length) throw new Error("Pause the other SEO package before activating this one.");
  }
  const { error } = await db.from("projects").update({ status })
    .eq("organization_id", organization.id).eq("client_id", client_id).eq("id", project_id);
  if (error) throw new Error("Unable to update the service. Please try again.");
  revalidatePath("/", "layout");
}
