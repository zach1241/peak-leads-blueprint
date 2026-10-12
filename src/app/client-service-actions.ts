"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/data/workspace";
import type { WorkState } from "@/app/work-actions";

async function serviceContext(clientId: string) {
  const workspace = await requireWorkspace();
  if (!workspace.canAdmin) throw new Error("Only owners and admins can manage services.");
  const { data: client, error } = await workspace.db.from("clients").select("id")
    .eq("organization_id",workspace.organization.id).eq("id",clientId).maybeSingle();
  if (error || !client) throw new Error("This client is not available in your workspace.");
  return workspace;
}

async function seoConflict(db: Awaited<ReturnType<typeof requireWorkspace>>["db"], organizationId: string, clientId: string, name: string, exclude?: string) {
  if (!["Standard SEO","Dominate SEO"].includes(name)) return false;
  const other = name === "Standard SEO" ? "Dominate SEO" : "Standard SEO";
  const { data, error } = await db.from("projects")
    .select("id,service_templates!inner(name)")
    .eq("organization_id",organizationId).eq("client_id",clientId)
    .eq("status","active").eq("service_templates.name",other);
  if (error) throw new Error("Unable to verify the client's SEO packages.");
  return (data ?? []).some(project => project.id !== exclude);
}

export async function changeClientServiceStatus(_: WorkState, form: FormData): Promise<WorkState> {
  const parsed = z.object({
    client_id:z.uuid(),project_id:z.uuid(),status:z.enum(["active","on_hold"])
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return {error:"Invalid service selection."};
  try {
    const {client_id,project_id,status}=parsed.data;
    const {db,organization}=await serviceContext(client_id);
    const {data:project,error}=await db.from("projects")
      .select("id,service_templates(name)")
      .eq("organization_id",organization.id).eq("client_id",client_id).eq("id",project_id).maybeSingle();
    if(error || !project) return {error:"Service not found. Refresh and try again."};
    if(status==="active" && await seoConflict(db,organization.id,client_id,project.service_templates?.name ?? "",project_id))
      return {error:"Pause the other SEO package first. Only one SEO package can be active."};
    const result=await db.from("projects").update({status})
      .eq("organization_id",organization.id).eq("client_id",client_id).eq("id",project_id).select("id").single();
    if(result.error) return {error:"Unable to update this service."};
    if(status==="active") {
      const generated=await db.rpc("generate_service_deliverables",{p_organization_id:organization.id,p_project_id:project_id});
      if(generated.error) return {error:"Service activated, but tasks could not be generated. Use Refresh recurring work."};
    }
    revalidatePath("/","layout");
    return {success:status==="active"?"Service activated.":"Service removed from active work. Its history remains saved."};
  } catch(e) {return {error:e instanceof Error?e.message:"Unable to update service."};}
}

export async function addClientService(_: WorkState,form:FormData):Promise<WorkState> {
  const parsed=z.object({client_id:z.uuid(),service_template_id:z.uuid()}).safeParse(Object.fromEntries(form));
  if(!parsed.success)return {error:"Select a service to add."};
  try{
    const {db,organization}=await serviceContext(parsed.data.client_id);
    const {data:template,error}=await db.from("service_templates").select("id,name")
      .eq("organization_id",organization.id).eq("id",parsed.data.service_template_id).single();
    if(error||!template)return {error:"Service template unavailable."};
    if(await seoConflict(db,organization.id,parsed.data.client_id,template.name))
      return {error:"Pause the other SEO package before adding this one."};
    const {data:existing,error:existingError}=await db.from("projects").select("id,status")
      .eq("organization_id",organization.id).eq("client_id",parsed.data.client_id)
      .eq("service_template_id",template.id).maybeSingle();
    if(existingError)return {error:"Unable to check linked services."};
    if(existing) {
      if(existing.status==="active")return {error:"This service is already active."};
      const activated=await db.from("projects").update({status:"active"}).eq("id",existing.id)
        .eq("organization_id",organization.id);
      if(activated.error)return {error:"Unable to reactivate this service."};
      const generated=await db.rpc("generate_service_deliverables",{p_organization_id:organization.id,p_project_id:existing.id});
      revalidatePath("/","layout");
      return generated.error?{error:"Service reactivated. Refresh recurring work to generate tasks."}:{success:"Service reactivated."};
    }
    const {error:connectError}=await db.rpc("connect_client_service",{
      p_organization_id:organization.id,p_client_id:parsed.data.client_id,
      p_service_template_id:template.id,p_assignees:[]
    });
    if(connectError)return {error:"Unable to add this service. Check permissions or try again."};
    revalidatePath("/","layout");
    return {success:"Service added. New deliverables are unassigned until you assign teammates."};
  }catch(e){return {error:e instanceof Error?e.message:"Unable to add service."};}
}
