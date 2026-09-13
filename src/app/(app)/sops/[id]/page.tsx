import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import { resourceImage } from "@/lib/data/resources";
import { ResourceForm } from "@/components/resources/resource-form";
import { PageHeading } from "@/components/work/shared";
import { ActionForm } from "@/components/work/action-form";
import { deleteResource } from "@/app/resource-actions";
export default async function SOP({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, organization, canAdmin } = await requireWorkspace();
  if (!canAdmin) notFound();
  if (id !== "new" && !z.uuid().safeParse(id).success) notFound();
  const result = id === "new" ? null : await db.from("sops").select("*").eq("organization_id", organization.id).eq("id", id).maybeSingle();
  if (result?.error) throw new Error("Unable to load SOP.");
  if (id !== "new" && !result?.data) notFound();
  const row = result?.data;
  return <><Link className="back-link" href="/sops">← SOPs</Link><PageHeading title={row ? "Edit SOP" : "Add SOP"} description="Give your team a useful resource to learn from." />
    <section className="panel form-panel"><ResourceForm kind="sops" organizationId={organization.id} value={row ?? undefined} imageUrl={await resourceImage(row?.image_path ?? null)} /></section>
    {row && <details className="panel form-panel section-gap"><summary>Delete SOP</summary><ActionForm action={deleteResource.bind(null, "sops")} submit="Delete SOP"><input type="hidden" name="id" value={id} /><label><input type="checkbox" name="confirm" value="yes" required /> Permanently delete this SOP</label></ActionForm></details>}
  </>;
}
