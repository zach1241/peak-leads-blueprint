import "server-only";
import { cache } from "react";
import { requireWorkspace } from "./workspace";

export const helpAttention = cache(async () => {
  const { db, organization } = await requireWorkspace();
  const result = await db.from("help_requests").select("id,title,status,created_at,profiles!help_requests_requester_id_fkey(full_name)", { count: "exact" })
    .eq("organization_id", organization.id).neq("status", "resolved")
    .order("created_at", { ascending: false }).order("id").limit(5);
  if (result.error) {
    console.error("Help Requests query failed", { code: result.error.code });
    return { rows: [], count: null, unavailable: true };
  }
  return { rows: result.data, count: result.count ?? 0, unavailable: false };
});
export async function resourceImage(path: string | null) {
  if (!path) return null;
  const { db, organization } = await requireWorkspace();
  if (!path.startsWith(`${organization.id}/`)) return null;
  const { data, error } = await db.storage.from("workspace-images").createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
export function resourceDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}
