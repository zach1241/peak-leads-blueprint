import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/data/workspace";
import { PackageManager } from "@/components/work/package-manager";
import { PageHeading } from "@/components/work/shared";
export default async function Packages(){
 const {db,organization,canAdmin}=await requireWorkspace();
 if(!canAdmin)notFound();
 const {data,error}=await db.from("service_templates")
  .select("id,name,source_note,service_deliverables(id,name,cadence,target_min,target_max,unit,instructions,active)")
  .eq("organization_id",organization.id).order("name");
 if(error)throw new Error("Unable to load service catalog.");
 return <><PageHeading title="Services & Packages" description="Manage service definitions, recurring deliverables and targets. Admins only."/>
 <p className="data-note">Changes to targets affect newly generated work, not historical tasks. Archive deliverables rather than deleting history.</p>
 <PackageManager packages={data??[]}/></>;
}