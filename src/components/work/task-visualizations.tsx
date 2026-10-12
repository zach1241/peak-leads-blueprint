import Link from "next/link";
import { StatusEditor } from "@/components/work/status-editor";
import type { taskList } from "@/lib/data/queries";
import { workspaceMonth } from "@/lib/data/task-filters";
import styles from "./task-visualizations.module.css";
type Tasks = Awaited<ReturnType<typeof taskList>>["rows"];
const groups = [
  ["backlog", "Backlog"], ["todo", "To do"], ["in_progress", "In progress"], ["review", "Review"],
  ["done", "Done"], ["cancelled", "Cancelled"]
] as const;
function Entry({task,canEditStatus}:{task:Tasks[number];canEditStatus:boolean}){
  return <article className={styles.card}>
    <Link className={styles.taskTitle} href={`/tasks/${task.id}`}>{task.service_deliverables?.name||task.title}</Link>
    <span className={styles.context}>{task.clients?.name||"No client"} · {task.projects?.name||"General work"}</span>
    <span className={styles.meta}>{task.due_date?`Due ${task.due_date}`:"No due date"} · {task.completed_quantity}/{task.target_min} {task.target_unit}</span>
    {canEditStatus&&<StatusEditor id={task.id} updatedAt={task.updated_at} title={task.title} status={task.status} quantity={task.completed_quantity} target={task.target_min}/>}
  </article>;
}
export function TaskBoard({tasks,canEditStatus}:{tasks:Tasks;canEditStatus:boolean}){
 return <div className={styles.board} aria-label="Tasks grouped by status">
  {groups.map(([status,title])=>{
    const rows=tasks.filter(t=>t.status===status);
    return <section key={status} className={styles.column}>
      <h3 className={styles.columnTitle}><span>{title}</span><span className={styles.number}>{rows.length}</span></h3>
      <div className={styles.stack}>{rows.map(t=><Entry key={t.id} task={t} canEditStatus={canEditStatus}/>)}
        {!rows.length&&<p className={styles.empty}>No tasks</p>}</div>
    </section>;
  })}
 </div>;
}
export function TaskCalendar({tasks}:{tasks:Tasks}){
 const month=workspaceMonth(); const [year,number]=month.start.slice(0,7).split("-").map(Number);
 const first=new Date(Date.UTC(year,number-1,1)).getUTCDay(),days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const cells=Array.from({length:Math.ceil((first+days)/7)*7},(_,i)=>i-first+1);
 const byDate=new Map<string,Tasks>();
 for(const t of tasks){if(!t.due_date)continue;byDate.set(t.due_date,[...(byDate.get(t.due_date)||[]),t]);}
 return <div className={styles.calendarScroll}><div className={styles.calendar} aria-label={`Calendar for ${month.label}`}>
  {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(day=><strong className={styles.dayName} key={day}>{day}</strong>)}
  {cells.map((day,i)=>{
    const valid=day>0&&day<=days;
    const key=valid?`${month.start.slice(0,7)}-${String(day).padStart(2,"0")}`:"";
    const matching=byDate.get(key)||[];
    return <div key={i} className={`${styles.dateCell} ${!valid?styles.outside:""}`}>
      {valid&&<><time dateTime={key} className={styles.dayNumber}>{day}</time>
      {matching.slice(0,5).map(t=><Link key={t.id} href={`/tasks/${t.id}`} className={styles.calendarTask} title={t.title}>{t.service_deliverables?.name||t.title}<small>{t.clients?.name}</small></Link>)}
      {matching.length>5&&<span className={styles.more}>+{matching.length-5} more tasks</span>}</>}
    </div>;
  })}
 </div><p className={styles.note}>Tasks appear on their due dates. Undated tasks remain available in List and Board.</p></div>;
}
export function TaskGantt({tasks}:{tasks:Tasks}){
 const month=workspaceMonth();const [year,number]=month.start.slice(0,7).split("-").map(Number);
 const days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const dayNumbers=Array.from({length:days},(_,i)=>i+1);
 const rows=tasks.filter(t=>t.period_start||t.due_date).slice().sort((a,b)=>(a.due_date||"").localeCompare(b.due_date||""));
 return <div className={styles.ganttScroll} role="region" aria-label={`Task timeline for ${month.label}`} tabIndex={0}>
  <div className={styles.gantt} style={{gridTemplateColumns:`230px repeat(${days}, minmax(28px, 1fr))`}}>
    <strong className={styles.ganttHeading}>Task · {month.label}</strong>
    {dayNumbers.map(d=><span key={d} className={styles.ganttDay}>{d}</span>)}
    {rows.map(t=>{
      const start=Math.max(1,Math.min(days,Number((t.period_start||t.due_date||month.start).slice(8,10))));
      const end=Math.max(start,Math.min(days,Number((t.period_end||t.due_date||month.end).slice(8,10))));
      return <div key={t.id} className={styles.ganttRow}>
        <Link href={`/tasks/${t.id}`} className={styles.ganttLabel} title={t.title}>{t.service_deliverables?.name||t.title}<small>{t.clients?.name}</small></Link>
        <div className={styles.track} style={{gridColumn:`2 / span ${days}`,gridTemplateColumns:`repeat(${days}, minmax(28px, 1fr))`}}>
        <div className={styles.bar} style={{gridColumn:`${start} / span ${end-start+1}`}} title={`${t.title}: ${t.period_start||t.due_date} to ${t.period_end||t.due_date}`}/>
        </div>
      </div>;
    })}
  </div>
  {!rows.length&&<p className={styles.empty}>No dated tasks this month.</p>}
 </div>;
}
