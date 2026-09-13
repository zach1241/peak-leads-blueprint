import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { resourceDate, resourceImage } from "@/lib/data/resources";
import { ResourceForm } from "@/components/resources/resource-form";
import { ImageViewer } from "@/components/resources/image-viewer";
import { PageHeading, Badge } from "@/components/work/shared";
import { ActionForm } from "@/components/work/action-form";
import { deleteResource, setHelpStatus } from "@/app/resource-actions";
export default async function HelpRequest({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, user, organization, canAdmin } = await requireWorkspace();
  if (id === "new") return <><Link className="back-link" href="/help-requests">← Help Requests</Link><PageHeading title="Ask for help" description="Describe the blocker and optionally attach or paste a screenshot." /><section className="panel form-panel"><ResourceForm kind="help" organizationId={organization.id} /></section></>;
  if (!z.uuid().safeParse(id).success) notFound();
  const { data: row, error } = await db.from("help_requests").select("*,profiles!help_requests_requester_id_fkey(full_name)").eq("organization_id", organization.id).eq("id", id).maybeSingle();
  if (error) throw new Error("Unable to load help request.");
  if (!row) notFound();
  const image = await resourceImage(row.image_path);
  return <><Link className="back-link" href="/help-requests">← Help Requests</Link><PageHeading title={row.title} description={`Requested by ${row.profiles?.full_name || "Team member"} · ${resourceDate(row.created_at)}`} />
    <section className="panel form-panel"><Badge value={row.status} /><p className="resource-message">{row.description}</p>{image && <ImageViewer src={image} alt={`Screenshot for ${row.title}`} />}{row.image_path && !image && <p>Screenshot unavailable. Refresh to try again.</p>}</section>
    {canAdmin && <section className="panel form-panel section-gap"><h2>Request status</h2><ActionForm action={setHelpStatus} submit="Update status"><input type="hidden" name="id" value={id} /><label>Status<select name="status" defaultValue={row.status}><option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option></select></label></ActionForm></section>}
    {(canAdmin || (row.requester_id === user.id && row.status === "open")) && <details className="panel form-panel section-gap"><summary>Edit request</summary><ResourceForm kind="help" organizationId={organization.id} value={row} imageUrl={image} /></details>}
    {canAdmin && <details className="panel form-panel section-gap"><summary>Delete request</summary><ActionForm action={deleteResource.bind(null, "help")} submit="Delete request"><input type="hidden" name="id" value={id} /><label><input type="checkbox" name="confirm" value="yes" required /> Permanently delete this request</label></ActionForm></details>}
  </>;
}
