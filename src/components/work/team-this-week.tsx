import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { teamWorkload } from "@/lib/data/team-workload";
export async function TeamThisWeek() {
  const workload = await teamWorkload();
  return <section className="panel section-gap"><div className="panel-heading"><div><h2>Team This Month</h2><p>{workload.start} – {workload.end} · {workload.unassigned} unassigned tasks</p></div></div>
    <ul className="team-list">{workload.members.map(member => <li key={member.id}><Avatar name={member.name} url={member.avatar} /><div><Link href={`/tasks?assignee=${member.id}`}>{member.name}</Link><small>{member.total} tasks this month · {member.done} done · {member.total - member.done} remaining · {member.review} review · {member.overdue} overdue</small></div></li>)}</ul>
    <p className="data-note">Tasks have a work period overlapping this calendar month or a due date within it. Shared tasks count for each assignee. Done counts refer to this month’s workload.</p>
  </section>;
}
