import Link from "next/link";
import { requireWorkspace } from "@/lib/data/workspace";
import {
  dashboardCounts,
  clientWorkSummary,
  taskStatusCounts,
  taskList,
  activity,
  directories,
} from "@/lib/data/queries";
import { TaskStatusOverview } from "@/components/work/task-status-overview";
import { Icon } from "@/components/icon";
import { TaskTable } from "@/components/work/task-table";
import { ActivityList } from "@/components/work/activity-list";
export default async function Dashboard() {
  const { user, organization } = await requireWorkspace();
  const [counts, upcoming, events, directory, statuses] = await Promise.all([
    dashboardCounts(),
    taskList({ assignee: user.id, upcoming: true, limit: 8 }),
    activity(1, 5),
    directories(),
    taskStatusCounts(),
  ]);
  const clients = await Promise.all(directory.clients.map(async client => ({ ...client, ...await clientWorkSummary(client.id) })));
  const attention = clients.filter(c => c.overdue || c.review).sort((a, b) => b.overdue - a.overdue || b.review - a.review);
  const outstanding = clients.reduce((sum, c) => sum + c.outstanding, 0);
  const metrics = [
    { label: "My Tasks", hint: "Open tasks assigned to you", icon: "tasks" },
    {
      label: "Due This Week",
      hint: "Your open tasks · Mon–Sun",
      icon: "calendar",
    },
    {
      label: "Overdue",
      hint: "Your open tasks before today",
      icon: "activity",
    },
    { label: "Active Clients", hint: "Across your workspace", icon: "clients" },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {organization.name.toUpperCase()} · YOUR DAY, AT A GLANCE
          </span>
          <h1>Let’s move work forward.</h1>
          <p>A clear view of your priorities, clients, and team.</p>
        </div>
        <Link className="button primary" href="/tasks/new">
          Create task
        </Link>
      </div>
      <p className="data-note">
        <Link className="text-link" href="/delivery">
          View service delivery →
        </Link>
      </p>
      <section className="metrics" aria-label="Workspace metrics">
        {metrics.map((m, i) => (
          <div className="metric" key={m.label}>
            <div>
              <span>{m.label}</span>
              <Icon name={m.icon} />
            </div>
            <strong>{counts[i]}</strong>
            <small>{m.hint}</small>
          </div>
        ))}
      </section>
      <p className="data-note">
        Live workspace totals · Calendar dates use South Africa time. Done and
        cancelled tasks are excluded.
      </p>
      <TaskStatusOverview counts={statuses} />
      <section className="panel section-gap">
        <div className="panel-heading">
          <div>
            <h2>Upcoming Tasks</h2>
            <p>Your open work, with the earliest deadlines first.</p>
          </div>
          <Link className="text-link" href={`/tasks?assignee=${user.id}`}>
            View my tasks →
          </Link>
        </div>
        <TaskTable tasks={upcoming.rows} members={directory.members} />
      </section>
      <div className="dashboard-grid section-gap">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Activity</h2>
              <p>The latest across your workspace.</p>
            </div>
            <Link className="text-link" href="/activity">
              View all →
            </Link>
          </div>
          <ActivityList rows={events.rows} members={directory.members} />
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Clients needing attention</h2><p>{outstanding} outstanding client tasks · Prioritized by overdue work, then review.</p></div></div>
          <ul className="record-list">
            {attention.slice(0, 5).map(client => <li key={client.id}><Link href={`/clients/${client.id}`}>{client.name}</Link><span>{client.overdue} overdue · {client.review} in review</span></li>)}
            {!attention.length && <li>No overdue client tasks or work waiting for review.</li>}
          </ul>
          <p className="data-note"><Link className="text-link" href="/clients">View all clients →</Link></p>
        </section>
      </div>
    </>
  );
}
