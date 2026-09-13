import Link from "next/link";
import { helpAttention, resourceDate } from "@/lib/data/resources";
import { Badge } from "@/components/work/shared";
export async function NeedsAttention() {
  const { rows, count, unavailable } = await helpAttention();
  if (unavailable) return <section className="panel section-gap"><div className="panel-heading"><div><h2>Needs Attention</h2><p role="status">Help requests are temporarily unavailable. Refresh to try again.</p></div></div></section>;
  return <section className="panel section-gap"><div className="panel-heading"><div><h2>Needs Attention</h2><p>{count ? `${count} unresolved help requests` : "No unresolved help requests. Your team is clear."}</p></div><Link className="text-link" href="/help-requests">View all help requests →</Link></div>
    {!!rows.length && <ul className="record-list">{rows.map(row => <li key={row.id}><div><Link href={`/help-requests/${row.id}`}>{row.title}</Link><small>{row.profiles?.full_name || "Team member"} · {resourceDate(row.created_at)}</small></div><Badge value={row.status} /></li>)}</ul>}
  </section>;
}
