"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace, canUpdateTask } from "@/lib/data/workspace";
import type { WorkState } from "./work-actions";
export async function generateDeliverables(): Promise<
  WorkState & { inserted?: number }
> {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) return { error: "Only owners and admins can generate deliverables." };
  const { data, error } = await db.rpc("generate_current_deliverables", {
    p_organization_id: organization.id,
  });
  if (error)
    return {
      error: "Unable to generate this period’s deliverables. Try again.",
    };
  if (data) revalidatePath("/", "layout");
  return {
    inserted: data,
    success: data
      ? `${data} tasks added.`
      : "This period is up to date.",
  };
}
export async function saveQuantity(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const parsed = z
    .object({
      id: z.uuid(),
      quantity: z.coerce.number().int().min(0).max(1000000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Enter a valid whole-number quantity." };
  if (!await canUpdateTask(parsed.data.id)) return { error: "You can only update tasks assigned to you." };
  const { db, organization } = await requireWorkspace();
  const { data, error } = await db
    .from("tasks")
    .update({ completed_quantity: parsed.data.quantity })
    .eq("id", parsed.data.id)
    .eq("organization_id", organization.id)
    .not("deliverable_definition_id", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      error:
        "Unable to save. Quantity must be within the deliverable’s target range.",
    };
  revalidatePath("/", "layout");
  return { success: "Delivered quantity updated." };
}
export async function saveResponsibility(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const parsed = z
    .object({
      id: z.uuid(),
      status: z.enum(["active", "blocked", "paused"]),
      status_note: z.string().trim().max(2000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Check the status and note (maximum 2,000 characters)." };
  const { db, organization } = await requireWorkspace();
  const { id, ...values } = parsed.data;
  const { data, error } = await db
    .from("managed_responsibilities")
    .update(values)
    .eq("id", id)
    .eq("organization_id", organization.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: "Unable to update this responsibility." };
  revalidatePath("/", "layout");
  return { success: "Responsibility status updated." };
}
