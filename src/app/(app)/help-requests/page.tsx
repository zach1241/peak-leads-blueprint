import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import { resourceDate } from "@/lib/data/resources";
import { PageHeading, Badge, Pagination, pageNumber } from "@/components/work/shared";
export default async function HelpRequests({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db, organization } = await requireWorkspace();
  const page = pageNumber((await searchParams).page);
  const { data, count, error } = await db.from("help_requests").select("*,profiles!help_requests_requester_id_fkey(full_name)", { count: "exact" }).eq("organization_id", organization.id)
    .order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load help requests. Check the workspace resources migration.");
  return <><PageHeading title="Help Requests" description="Stuck on something? Ask your team for help." href="/help-requests/new" action="Ask for help" />
    <section className="panel"><ul className="record-list">{data.map(row => <li key={row.id} className={row.status !== "resolved" ? "help-unresolved" : ""}><div><Link className="record-link" href={`/help-requests/${row.id}`}>{row.title}</Link><small>{row.profiles?.full_name || "Team member"} · {resourceDate(row.created_at)}{row.image_path ? " · Screenshot attached" : ""}</small></div><Badge value={row.status} /></li>)}{!data.length && <li>No help requests yet. Your team can ask for support here.</li>}</ul><Pagination count={count ?? 0} page={page} href="/help-requests" /></section>
  </>;
}
