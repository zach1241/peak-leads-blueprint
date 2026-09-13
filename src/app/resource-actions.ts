"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/data/workspace";
import type { WorkState } from "./work-actions";
export type ResourceState = WorkState & { id?: string };
const link = z.string().trim().max(2048).refine(value => {
  if (/^\/(?!\/)/.test(value) && !/[\\\s]/.test(value)) return true;
  try { return ["https:", "http:"].includes(new URL(value).protocol); } catch { return false; }
}, "Use an HTTP(S) link or an internal path starting with /.");
const fields = z.object({
  id: z.union([z.uuid(), z.literal("")]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(10000),
  image_path: z.string().max(300).transform(value => value || null),
});
function refresh() { revalidatePath("/", "layout"); }
export async function saveResource(kind: "sops" | "help", form: FormData): Promise<ResourceState> {
  const { db, user, organization, canAdmin } = await requireWorkspace();
  if (kind !== "sops" && kind !== "help") return { error: "Unknown resource." };
  if (kind === "sops" && !canAdmin) return { error: "Only owners and admins can manage SOPs." };
  const parsed = fields.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...values } = parsed.data;
  if (values.image_path && !values.image_path.startsWith(`${organization.id}/${kind}/`)) return { error: "Choose an image from this workspace." };
  if (kind === "sops") {
    const extra = z.object({ resource_url: link, resource_type: z.enum(["loom", "youtube", "document", "other"]) }).safeParse(Object.fromEntries(form));
    if (!extra.success) return { error: extra.error.issues[0].message };
    if (values.description.length > 2000) return { error: "Keep the SOP description under 2,000 characters." };
    const data = { ...values, ...extra.data };
    const result = id ? await db.from("sops").update(data).eq("organization_id", organization.id).eq("id", id).select("id").single()
      : await db.from("sops").insert({ ...data, organization_id: organization.id, created_by: user.id }).select("id").single();
    if (result.error) return { error: "Unable to save this SOP. Check your permissions and image upload." };
    refresh(); return { success: "SOP saved.", id: result.data.id };
  }
  if (!values.description) return { error: "Describe where you need help." };
  const result = id ? await db.from("help_requests").update(values).eq("organization_id", organization.id).eq("id", id).select("id").single()
    : await db.from("help_requests").insert({ ...values, organization_id: organization.id, requester_id: user.id }).select("id").single();
  if (result.error) return { error: "Unable to save. You can edit your own request while it is Open; admins can manage all requests." };
  refresh(); return { success: "Help request saved.", id: result.data.id };
}
export async function setHelpStatus(_: WorkState, form: FormData): Promise<WorkState> {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) return { error: "Only owners and admins can change request status." };
  const parsed = z.object({ id: z.uuid(), status: z.enum(["open", "in_progress", "resolved"]) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Choose a valid request and status." };
  const result = await db.from("help_requests").update({ status: parsed.data.status }).eq("organization_id", organization.id).eq("id", parsed.data.id).select("id").single();
  if (result.error) return { error: "Unable to update request status." };
  refresh(); return { success: "Status updated." };
}
export async function deleteResource(kind: "sops" | "help", _: WorkState, form: FormData): Promise<WorkState> {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin || !["sops", "help"].includes(kind)) return { error: "Only owners and admins can delete resources." };
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success || form.get("confirm") !== "yes") return { error: "Confirm deletion first." };
  const result = await db.from(kind === "sops" ? "sops" : "help_requests").delete().eq("organization_id", organization.id).eq("id", id.data).select("id").single();
  if (result.error) return { error: "Unable to delete this resource." };
  refresh(); redirect(kind === "sops" ? "/sops" : "/help-requests");
}
