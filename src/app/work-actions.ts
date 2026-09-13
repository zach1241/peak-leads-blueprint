"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace, workspaceOptions } from "@/lib/data/workspace";
import {
  taskSchema,
  clientSchema,
  projectSchema,
  commentSchema,
} from "@/lib/data/validation";
export type WorkState = { error?: string; success?: string };
function errorMessage(error: { code?: string }) {
  if (error.code === "23514")
    return "For recurring deliverables, record the delivered quantity before marking done. Check other field limits too.";
  if (error.code === "23505")
    return "That value already exists in this workspace. Choose a different slug.";
  if (error.code === "23503")
    return "A linked record or assignee is no longer available in this workspace. Refresh and try again.";
  if (error.code === "42501")
    return "You do not have permission to make this change.";
  return "Unable to save changes. Check the fields and try again.";
}
function recordId(form: FormData) {
  return z.union([z.uuid(), z.literal("")]).safeParse(form.get("id") ?? "");
}
function refreshWork() {
  revalidatePath("/", "layout");
}
export async function selectWorkspace(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { memberships } = await workspaceOptions();
  const id = String(form.get("organization_id") ?? "");
  if (!memberships.some((m) => m.organization_id === id))
    return { error: "Workspace access denied." };
  (await cookies()).set("peak-workspace", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  refreshWork();
  redirect("/dashboard");
}
export async function saveTask(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db, organization } = await requireWorkspace();
  const parsed = taskSchema.safeParse({
    ...Object.fromEntries(form),
    assignees: form.getAll("assignees"),
  });
  const id = recordId(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!id.success) return { error: "Invalid task." };
  const v = parsed.data;
  const { data, error } = await db.rpc("save_task", {
    p_organization_id: organization.id,
    p_id: id.data || null,
    p_title: v.title,
    p_description: v.description,
    p_status: v.status,
    p_priority: v.priority,
    p_due_date: v.due_date,
    p_project_id: v.project_id,
    p_client_id: v.client_id,
    p_assignees: [...new Set(v.assignees)],
  });
  if (error) return { error: errorMessage(error) };
  refreshWork();
  redirect(`/tasks/${data}`);
}
export async function saveClient(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) return { error: "Only owners and admins can manage clients." };
  const parsed = clientSchema.safeParse(Object.fromEntries(form));
  const id = recordId(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!id.success) return { error: "Invalid client." };
  const result = id.data
    ? await db
        .from("clients")
        .update(parsed.data)
        .eq("id", id.data)
        .eq("organization_id", organization.id)
        .select("id")
        .single()
    : await db
        .from("clients")
        .insert({ ...parsed.data, organization_id: organization.id })
        .select("id")
        .single();
  if (result.error) return { error: errorMessage(result.error) };
  refreshWork();
  redirect(`/clients/${result.data.id}`);
}
export async function saveProject(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db, organization, user } = await requireWorkspace();
  const parsed = projectSchema.safeParse(Object.fromEntries(form));
  const id = recordId(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!id.success) return { error: "Invalid project." };
  const result = id.data
    ? await db
        .from("projects")
        .update(parsed.data)
        .eq("id", id.data)
        .eq("organization_id", organization.id)
        .select("id")
        .single()
    : await db
        .from("projects")
        .insert({
          ...parsed.data,
          organization_id: organization.id,
          created_by: user.id,
        })
        .select("id")
        .single();
  if (result.error) return { error: errorMessage(result.error) };
  refreshWork();
  redirect(`/projects/${result.data.id}`);
}
export async function addComment(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db, organization, user } = await requireWorkspace();
  const parsed = commentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await db.from("comments").insert({
    ...parsed.data,
    organization_id: organization.id,
    author_id: user.id,
  });
  if (error) return { error: errorMessage(error) };
  refreshWork();
  return { success: "Comment added." };
}
export async function saveProfile(
  _: WorkState,
  form: FormData,
): Promise<WorkState> {
  const { db, user } = await requireWorkspace();
  const parsed = z
    .object({
      full_name: z.string().trim().max(120),
      avatar_url: z
        .union([z.url({ protocol: /^https$/ }).max(2048), z.literal("")])
        .transform((v) => v || null),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await db
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);
  if (error) return { error: "Unable to update your profile." };
  refreshWork();
  return { success: "Profile updated." };
}
