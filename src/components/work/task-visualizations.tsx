import Link from "next/link";
import { StatusEditor } from "@/components/work/status-editor";
import type { taskList } from "@/lib/data/queries";
import { workspaceMonth } from "@/lib/data/task-filters";
import { displayDate } from "@/lib/data/constants";
import { calendarTaskBuckets, taskTimelinePlacement, type TaskViewMonth } from "@/lib/data/task-view-models";
import type { CSSProperties } from "react";
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
    {canEditStatus&&<StatusEditor key={`${task.id}:${task.updated_at}`} id={task.id} updatedAt={task.updated_at} title={task.title} status={task.status} quantity={task.completed_quantity} target={task.target_min}/>}
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
function CalendarEntry({ task, showDate = false }: { task: Tasks[number]; showDate?: boolean }) {
 return <Link href={`/tasks/${task.id}`} className={styles.calendarTask} title={task.title}>
  {task.service_deliverables?.name || task.title}<small>{task.clients?.name}</small>
  {showDate && <small>{task.due_date ? `Due ${displayDate(task.due_date)}` : "No due date"}</small>}
 </Link>;
}

export function TaskCalendar({tasks,month=workspaceMonth()}:{tasks:Tasks;month?:TaskViewMonth}){
 const [year,number]=month.start.slice(0,7).split("-").map(Number);
 const first=new Date(Date.UTC(year,number-1,1)).getUTCDay(),days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const cells=Array.from({length:Math.ceil((first+days)/7)*7},(_,i)=>i-first+1);
 const {byDate,outside,undated}=calendarTaskBuckets(tasks,month);
 return <div className={styles.calendarScroll}><div className={styles.calendar} aria-label={`Calendar for ${month.label}`}>
  {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(day=><strong className={styles.dayName} key={day}>{day}</strong>)}
  {cells.map((day,i)=>{
    const valid=day>0&&day<=days;
    const key=valid?`${month.start.slice(0,7)}-${String(day).padStart(2,"0")}`:"";
    const matching=byDate.get(key)||[];
    return <div key={i} className={`${styles.dateCell} ${!valid?styles.outside:""}`}>
      {valid&&<><time dateTime={key} className={styles.dayNumber}>{day}</time>
      {matching.slice(0,5).map(t=><CalendarEntry key={t.id} task={t}/>)}
      {matching.length>5&&<details className={styles.dayOverflow}>
        <summary className={styles.more} aria-label={`Show ${matching.length-5} more tasks due ${displayDate(key)}`}>+{matching.length-5} more tasks</summary>
        <div className={styles.overflowTasks}>
          {matching.slice(5).map(t=><CalendarEntry key={t.id} task={t}/>)}
        </div>
      </details>}</>}
    </div>;
  })}
 </div>
 {(outside.length>0||undated.length>0)&&<div className={styles.calendarExtraGroups}>
  {outside.length>0&&<details className={styles.calendarExtras} open>
   <summary>Deadlines outside {month.label} · {outside.length}</summary>
   <div className={styles.extraTasks}>{outside.map(t=><CalendarEntry key={t.id} task={t} showDate/>)}</div>
  </details>}
  {undated.length>0&&<details className={styles.calendarExtras} open>
   <summary>No due date · {undated.length}</summary>
   <div className={styles.extraTasks}>{undated.map(t=><CalendarEntry key={t.id} task={t} showDate/>)}</div>
  </details>}
 </div>}
 <p className={styles.note}>Tasks appear on their due dates. Expand a day to see all its tasks.</p></div>;
}
export function TaskGantt({tasks,month=workspaceMonth()}:{tasks:Tasks;month?:TaskViewMonth}){
 const [year,number]=month.start.slice(0,7).split("-").map(Number);
 const days=new Date(Date.UTC(year,number,0)).getUTCDate();
 const dayNumbers=Array.from({length:days},(_,i)=>i+1);
 const rows=tasks.slice().sort((a,b)=>(a.due_date||"9999-12-31").localeCompare(b.due_date||"9999-12-31"));
 return <div className={styles.ganttScroll} role="region" aria-label={`Task timeline for ${month.label}`} tabIndex={0}>
  <div className={styles.gantt} style={{gridTemplateColumns:`230px repeat(${days}, minmax(28px, 1fr))`,"--days":days} as CSSProperties}>
    <strong className={styles.ganttHeading}>Task · {month.label}</strong>
    {dayNumbers.map(d=><span key={d} className={styles.ganttDay}>{d}</span>)}
    {rows.map(t=>{
      const placement=taskTimelinePlacement(t,month);
      const rangeDescription=placement
        ? placement.milestone ? `${t.period_start ? "Starts" : "Due"} ${displayDate(placement.start)}` : `${displayDate(placement.start)} to ${displayDate(placement.end)}`
        : "Unscheduled";
      return <div key={t.id} className={styles.ganttRow}>
        <Link href={`/tasks/${t.id}`} className={styles.ganttLabel} title={t.title}>{t.service_deliverables?.name||t.title}<small>{t.clients?.name}</small></Link>
        <div className={styles.track} style={{gridColumn:`2 / span ${days}`,gridTemplateColumns:`repeat(${days}, minmax(28px, 1fr))`}}>
        {placement?.visible ? <Link
          href={`/tasks/${t.id}`}
          className={placement.milestone ? styles.milestone : styles.bar}
          style={{gridColumn:`${placement.startColumn} / span ${placement.span}`}}
          title={`${t.title}: ${rangeDescription}`}
          aria-label={`${t.service_deliverables?.name||t.title}: ${rangeDescription}`}
        >{placement.milestone ? <span aria-hidden="true">◆</span> : null}</Link> : <span className={styles.timelineNote}>
          {placement ? (placement.end < month.start ? "Before displayed month" : "After displayed month") : "Unscheduled"}
          {placement && <span className="sr-only"> · {rangeDescription}</span>}
        </span>}
        </div>
      </div>;
    })}
  </div>
  {!rows.length&&<p className={styles.empty}>No tasks this month.</p>}
  <p className={styles.note}>Bars show recorded work periods; diamonds show tasks with a single known date.</p>
 </div>;
}
