import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { workspaceOptions } from "@/lib/data/workspace";
export async function GET() {
  const { db, organizations } = await workspaceOptions();
  const selected = (await cookies()).get("peak-workspace")?.value;
  const organization = organizations.find(row => row.id === selected) ?? organizations[0];
  if (!organization) return NextResponse.json({ count: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  const result = await db.from("help_requests").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).neq("status", "resolved");
  if (result.error) return NextResponse.json({ error: "Help count unavailable" }, { status: 503 });
  return NextResponse.json({ count: result.count ?? 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
