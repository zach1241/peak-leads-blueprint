"use client";
import { useActionState } from "react";
import { savePackage, saveDeliverable, archiveCatalogItem, restoreDeliverable } from "@/app/package-actions";
import type { WorkState } from "@/app/work-actions";
import styles from "./package-manager.module.css";
type Deliverable={id:string;name:string;cadence:string;target_min:number;target_max:number;unit:string;instructions:string|null;active:boolean};
type Package={id:string;name:string;source_note:string|null;service_deliverables:Deliverable[]};
function SaveForm({action,children,submit}:{action:(state:WorkState,form:FormData)=>Promise<WorkState>;children:React.ReactNode;submit:string}){
 const [result,formAction,pending]=useActionState(action,{});
 return <form action={formAction} className={styles.form}>{children}<button disabled={pending} className="button primary">{pending?"Saving…":submit}</button>{result.error&&<p role="alert" className="form-error">{result.error}</p>}{result.success&&<p role="status" className="form-success">{result.success}</p>}</form>;
}
export function PackageManager({packages}:{packages:Package[]}){
 return <div className={styles.manager}>
 <details className="panel form-panel"><summary><strong>+ Create package</strong></summary>
 <SaveForm action={savePackage} submit="Create package"><input type="hidden" name="id" value=""/><label>Name<input name="name" maxLength={160} required placeholder="e.g. Website Care"/></label><label>Details<textarea name="source_note" maxLength={2000} rows={2}/></label></SaveForm></details>
 {packages.map(pkg=><section className="panel form-panel section-gap" key={pkg.id}>
 <details><summary className={styles.heading}><strong>{pkg.name}</strong><span>{pkg.service_deliverables.filter(d=>d.active).length} active deliverables</span></summary>
 <div className={styles.section}>
 <details><summary>Edit package information</summary><SaveForm action={savePackage} submit="Save package"><input name="id" type="hidden" value={pkg.id}/><label>Name<input name="name" defaultValue={pkg.name} required/></label><label>Details<textarea name="source_note" defaultValue={pkg.source_note??""} rows={2}/></label></SaveForm></details>
 <div className={styles.items}>{pkg.service_deliverables.map(d=><details key={d.id} className={styles.item}>
 <summary><strong>{d.name}</strong><span>{d.target_min}{d.target_max!==d.target_min?`–${d.target_max}`:""} {d.unit} / {d.cadence==="weekly"?"week":"month"} {d.active?"":" · Archived"}</span></summary>
 <SaveForm action={saveDeliverable} submit="Save changes">
 <input name="id" type="hidden" value={d.id}/><input name="service_template_id" type="hidden" value={pkg.id}/>
 <label>Name<input name="name" required defaultValue={d.name}/></label>
 <div className={styles.columns}><label>Cadence<select name="cadence" defaultValue={d.cadence}><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label><label>Unit<input name="unit" required defaultValue={d.unit}/></label><label>Minimum<input name="target_min" type="number" min="1" required defaultValue={d.target_min}/></label><label>Maximum<input name="target_max" type="number" min="1" required defaultValue={d.target_max}/></label></div>
 <label>Instructions<textarea name="instructions" rows={2} defaultValue={d.instructions??""}/></label>
 </SaveForm>
 {d.active?<SaveForm action={archiveCatalogItem} submit="Archive deliverable"><input name="kind" type="hidden" value="deliverable"/><input name="id" type="hidden" value={d.id}/></SaveForm>:<SaveForm action={restoreDeliverable} submit="Restore deliverable"><input name="id" type="hidden" value={d.id}/></SaveForm>}
 </details>)}</div>
 <details><summary>+ Add deliverable to {pkg.name}</summary><SaveForm action={saveDeliverable} submit="Add deliverable"><input type="hidden" name="id" value=""/><input type="hidden" name="service_template_id" value={pkg.id}/><label>Name<input required name="name" placeholder="e.g. Technical Audit"/></label><div className={styles.columns}><label>Cadence<select name="cadence"><option value="monthly">Monthly</option><option value="weekly">Weekly</option></select></label><label>Unit<input name="unit" required defaultValue="reports"/></label><label>Minimum<input name="target_min" type="number" min="1" required defaultValue={1}/></label><label>Maximum<input name="target_max" type="number" min="1" required defaultValue={1}/></label></div><label>Instructions<textarea name="instructions" rows={2}/></label></SaveForm></details>
 <details><summary>Archive package's deliverables</summary><p className="data-note">This stops future generation; linked projects and task history stay intact. Pause the package for all clients first.</p><SaveForm action={archiveCatalogItem} submit="Archive package"><input type="hidden" name="kind" value="package"/><input type="hidden" name="id" value={pkg.id}/></SaveForm></details>
 </div></details></section>)}
 </div>;
}
