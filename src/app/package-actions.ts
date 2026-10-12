"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import type { WorkState } from "@/app/work-actions";

const slug=(name:string)=>name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70);
const required=z.string().trim().min(1).max(160);
async function admin(){
 const context=await requireWorkspace();
 if(!context.canAdmin) throw new Error("Only owners and admins can edit packages.");
 return context;
}
export async function savePackage(_:WorkState,form:FormData):Promise<WorkState>{
 const parsed=z.object({id:z.union([z.uuid(),z.literal("")]),name:required,source_note:z.string().max(2000)}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"Enter a package name and valid details."};
 try{
 const {db,organization}=await admin();const v=parsed.data;
 if(v.id){
  const r=await db.from("service_templates").update({name:v.name,source_note:v.source_note})
   .eq("organization_id",organization.id).eq("id",v.id).select("id").single();
  if(r.error)return {error:"Unable to update package. Check for a duplicate name."};
 }else{
  const r=await db.from("service_templates").insert({organization_id:organization.id,name:v.name,code:slug(v.name)+"-"+crypto.randomUUID().slice(0,6),source_note:v.source_note}).select("id").single();
  if(r.error)return {error:"Unable to create package. Check its name."};
 }
 revalidatePath("/","layout");return {success:v.id?"Package updated.":"Package created."};
 }catch(e){return {error:e instanceof Error?e.message:"Unable to save package."};}
}
export async function saveDeliverable(_:WorkState,form:FormData):Promise<WorkState>{
 const parsed=z.object({
  id:z.union([z.uuid(),z.literal("")]),service_template_id:z.uuid(),name:required,
  cadence:z.enum(["weekly","monthly"]),target_min:z.coerce.number().int().min(1).max(100000),
  target_max:z.coerce.number().int().min(1).max(100000),unit:z.string().trim().min(1).max(60),
  instructions:z.string().trim().max(5000)
 }).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"Check deliverable name, targets and schedule."};
 try{
 const {db,organization}=await admin();const v=parsed.data;
 if(v.target_max<v.target_min)return {error:"Maximum target cannot be less than minimum."};
 const exists=await db.from("service_templates").select("id").eq("organization_id",organization.id).eq("id",v.service_template_id).single();
 if(exists.error)return {error:"Package not found."};
 const row={name:v.name,cadence:v.cadence,target_min:v.target_min,target_max:v.target_max,unit:v.unit,instructions:v.instructions};
 if(v.id){
  const r=await db.from("service_deliverables").update(row).eq("organization_id",organization.id).eq("service_template_id",v.service_template_id).eq("id",v.id).select("id").single();
  if(r.error)return {error:"Unable to update deliverable."};
 }else{
  const r=await db.from("service_deliverables").insert({...row,organization_id:organization.id,service_template_id:v.service_template_id,code:slug(v.name)+"-"+crypto.randomUUID().slice(0,6),active:true}).select("id").single();
  if(r.error)return {error:"Unable to create deliverable."};
 }
 revalidatePath("/","layout");return {success:v.id?"Deliverable updated. Future generated tasks use the new targets.":"Deliverable added."};
 }catch(e){return {error:e instanceof Error?e.message:"Unable to save deliverable."};}
}
export async function archiveCatalogItem(_:WorkState,form:FormData):Promise<WorkState>{
 const parsed=z.object({kind:z.enum(["deliverable","package"]),id:z.uuid()}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"Invalid item."};
 try{
 const {db,organization}=await admin();const v=parsed.data;
 if(v.kind==="deliverable"){
  const r=await db.from("service_deliverables").update({active:false}).eq("organization_id",organization.id).eq("id",v.id).select("id").single();
  if(r.error)return {error:"Unable to archive deliverable."};
 }else{
  const projects=await db.from("projects").select("id").eq("organization_id",organization.id).eq("service_template_id",v.id).eq("status","active").limit(1);
  if(projects.error)return {error:"Unable to check active clients."};
  if(projects.data?.length)return {error:"Pause this package for every client before archiving it."};
  const definitions=await db.from("service_deliverables").update({active:false}).eq("organization_id",organization.id).eq("service_template_id",v.id);
  if(definitions.error)return {error:"Unable to archive package deliverables."};
 }
 revalidatePath("/","layout");return {success:"Archived. Historical tasks remain intact."};
 }catch(e){return {error:e instanceof Error?e.message:"Unable to archive item."};}
}
export async function restoreDeliverable(_:WorkState,form:FormData):Promise<WorkState>{
 const id=z.uuid().safeParse(form.get("id"));if(!id.success)return {error:"Invalid deliverable."};
 try{const {db,organization}=await admin();const r=await db.from("service_deliverables").update({active:true}).eq("organization_id",organization.id).eq("id",id.data).select("id").single();if(r.error)return {error:"Unable to restore."};revalidatePath("/","layout");return {success:"Deliverable restored."};}catch(e){return {error:e instanceof Error?e.message:"Unable to restore."};}
}

export async function deleteCatalogItem(_:WorkState,form:FormData):Promise<WorkState>{
 const parsed=z.object({
  kind:z.enum(["deliverable","package"]),
  id:z.uuid(),
  confirm:z.literal("yes")
 }).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {error:"Confirm permanent deletion first."};
 try {
  const {db,organization}=await admin();
  const v=parsed.data;
  if(v.kind==="deliverable"){
   const used=await db.from("tasks").select("id").eq("organization_id",organization.id).eq("deliverable_definition_id",v.id).limit(1);
   if(used.error)return {error:"Unable to verify task history."};
   if(used.data?.length)return {error:"This deliverable has task history. Archive it instead to preserve reporting."};
   const r=await db.from("service_deliverables").delete().eq("organization_id",organization.id).eq("id",v.id).select("id").single();
   if(r.error)return {error:"This deliverable is referenced elsewhere. Archive it instead."};
  }else{
   const linked=await db.from("projects").select("id").eq("organization_id",organization.id).eq("service_template_id",v.id).limit(1);
   if(linked.error)return {error:"Unable to verify linked clients."};
   if(linked.data?.length)return {error:"This package is linked to a client. Remove the link and preserve the history, or archive the package."};
   const definitions=await db.from("service_deliverables").select("id").eq("organization_id",organization.id).eq("service_template_id",v.id).limit(1);
   if(definitions.error)return {error:"Unable to verify package deliverables."};
   if(definitions.data?.length)return {error:"Delete unused deliverables inside this package first, or archive the package."};
   const r=await db.from("service_templates").delete().eq("organization_id",organization.id).eq("id",v.id).select("id").single();
   if(r.error)return {error:"Package could not be deleted. It may still be referenced by a client."};
  }
  revalidatePath("/","layout");
  return {success:"Permanently deleted unused catalog item."};
 }catch(e){return {error:e instanceof Error?e.message:"Unable to delete catalog item."};}
}
