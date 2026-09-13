import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import { resourceDate, resourceImage } from "@/lib/data/resources";
import { PageHeading, Pagination, pageNumber } from "@/components/work/shared";
import { ImageViewer } from "@/components/resources/image-viewer";
export default async function SOPs({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { db, organization, canAdmin } = await requireWorkspace();
  const page = pageNumber((await searchParams).page);
  const { data, count, error } = await db.from("sops").select("*,profiles!sops_created_by_fkey(full_name)", { count: "exact" })
    .eq("organization_id", organization.id).order("created_at", { ascending: false }).order("id").range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load SOPs. Check the workspace resources migration.");
  const rows = await Promise.all(data.map(async row => ({ ...row, imageUrl: await resourceImage(row.image_path) })));
  return <>
    <PageHeading title="SOPs" description="Learn how we work. Tutorials, documentation and process resources." href={canAdmin ? "/sops/new" : undefined} action="Add SOP" />
    <div className="resource-grid">{rows.map(row => <article key={row.id} className="panel resource-card">
      {row.imageUrl && <ImageViewer src={row.imageUrl} alt={row.title} />}
      {row.image_path && !row.imageUrl && <p className="data-note">Image unavailable. Refresh to try again.</p>}
      <small>{({ loom: "Loom", youtube: "YouTube", document: "Document", other: "Website / Other" } as Record<string, string>)[row.resource_type]}</small>
      <h2>{row.title}</h2><p className="resource-message">{row.description}</p>
      <small>Added by {row.profiles?.full_name || "Team member"} · {resourceDate(row.created_at)}</small>
      <div className="resource-actions"><a className="button secondary" href={row.resource_url} target="_blank" rel="noopener noreferrer">Open resource ↗</a>{canAdmin && <Link className="text-link" href={`/sops/${row.id}`}>Edit SOP</Link>}</div>
    </article>)}</div>
    {!rows.length && <section className="panel form-panel"><h2>No SOPs yet</h2><p>An owner or admin can add your first process resource.</p></section>}
    <Pagination count={count ?? 0} page={page} href="/sops" />
  </>;
}
