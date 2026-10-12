import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { teamWorkload } from "@/lib/data/team-workload";
export async function TeamThisWeek() {
  const workload = await teamWorkload();
  return (
    <section className="panel section-gap">
      <div className="panel-heading">
        <div>
          <h2>Team this month</h2>
          <p>
            {workload.month} ·{" "}
            <Link className="text-link" href="/tasks?view=unassigned">
              {workload.unassigned} unassigned open tasks
            </Link>
          </p>
        </div>
      </div>
      <ul className="team-list">
        {workload.members.map((member) => (
          <li key={member.id}>
            <Avatar name={member.name} url={member.avatar} />
            <div>
              <Link href={`/tasks?assignee=${member.id}`}>{member.name}</Link>
              <small>
                {member.total} tasks this month · {member.done} done ·{" "}
                {member.total - member.done - member.cancelled} remaining ·{" "}
                {member.review} review · {member.overdue} overdue
                {member.cancelled ? ` · ${member.cancelled} cancelled` : ""}
              </small>
            </div>
          </li>
        ))}
      </ul>
      <p className="data-note">
        Shared tasks count for each assigned teammate. Earlier months are
        available in task history.
      </p>
    </section>
  );
}
