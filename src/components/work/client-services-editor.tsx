"use client";
import { useActionState, useState } from "react";
import { addClientService, changeClientServiceStatus } from "@/app/client-service-actions";
import styles from "./client-services-editor.module.css";

type Service = { id:string;name:string;status:string };
type Template = { id:string;name:string };
export function ClientServicesEditor({clientId,services,templates,canAdmin}:{
  clientId:string;services:Service[];templates:Template[];canAdmin:boolean;
}) {
  const [open,setOpen]=useState(false);
  const [statusResult,statusAction,statusPending]=useActionState(changeClientServiceStatus,{});
  const [addResult,addAction,addPending]=useActionState(addClientService,{});
  const active=services.filter(s=>s.status==="active");
  const inactive=services.filter(s=>s.status!=="active");
  const unused=templates.filter(t=>!services.some(s=>s.name===t.name));
  return <div className={styles.container}>
    <div className={styles.summary}>
      {active.length ? active.map(s=><span key={s.id} className={styles.chip}>{s.name}</span>)
        : <span className={styles.empty}>No active services</span>}
      {canAdmin && <button type="button" className={styles.manage} onClick={()=>setOpen(true)}>Manage services</button>}
    </div>
    {open && <div className={styles.backdrop} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="Manage client services">
        <header className={styles.header}><div><h2>Manage services</h2><p>Select the packages this client actually receives.</p></div>
          <button type="button" className={styles.close} aria-label="Close" onClick={()=>setOpen(false)}>×</button>
        </header>
        <div className={styles.body}>
          <h3>Active services <span className={styles.count}>{active.length}</span></h3>
          <div className={styles.list}>
          {active.length?active.map(service=><div key={service.id} className={styles.serviceRow}>
            <div><strong>{service.name}</strong><small>Generating deliverables</small></div>
            <form action={statusAction}>
              <input type="hidden" name="client_id" value={clientId}/><input type="hidden" name="project_id" value={service.id}/>
              <input type="hidden" name="status" value="on_hold"/>
              <button className={styles.remove} disabled={statusPending} title="Keep history and stop future deliverables">Remove</button>
            </form>
          </div>):<p className={styles.empty}>No active packages.</p>}
          </div>
          {inactive.length>0&&<><h3>Inactive services</h3><div className={styles.list}>
          {inactive.map(service=><div key={service.id} className={styles.serviceRow}>
            <div><strong>{service.name}</strong><small>{service.status.replaceAll("_"," ")}</small></div>
            {service.status==="on_hold"&&<form action={statusAction}>
              <input type="hidden" name="client_id" value={clientId}/><input type="hidden" name="project_id" value={service.id}/>
              <input type="hidden" name="status" value="active"/>
              <button className={styles.add} disabled={statusPending}>Activate</button>
            </form>}
          </div>)}
          </div></>}
          <h3>Add service</h3>
          <form action={addAction} className={styles.addForm}>
            <input type="hidden" name="client_id" value={clientId}/>
            <select name="service_template_id" aria-label="Choose a service" required defaultValue="">
              <option value="" disabled>Select a package or service</option>
              {unused.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}
            </select>
            <button type="submit" className={styles.add} disabled={addPending||!unused.length}>+ Add service</button>
          </form>
          {!unused.length&&<p className={styles.hint}>All existing packages are already linked. Reactivate an inactive service above.</p>}
          {statusResult.error&&<p role="alert" className={styles.error}>{statusResult.error}</p>}
          {statusResult.success&&<p role="status" className={styles.success}>{statusResult.success}</p>}
          {addResult.error&&<p role="alert" className={styles.error}>{addResult.error}</p>}
          {addResult.success&&<p role="status" className={styles.success}>{addResult.success}</p>}
          <p className={styles.hint}>Removing a service puts it on hold. Existing records stay saved, and paused services no longer create or show active deliverables.</p>
        </div>
        <footer className={styles.footer}><button type="button" className={styles.done} onClick={()=>setOpen(false)}>Done</button></footer>
      </section>
    </div>}
  </div>;
}
