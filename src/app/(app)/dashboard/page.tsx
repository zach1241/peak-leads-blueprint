import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
export default async function Dashboard() {
  await requireUser();
  const metrics = [
    { label: "My Tasks", hint: "Assigned to you", icon: "tasks" },
    { label: "Due This Week", hint: "Your next priorities", icon: "calendar" },
    { label: "Overdue", hint: "Needs your attention", icon: "activity" },
    { label: "Active Clients", hint: "Across your workspace", icon: "clients" },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR DAY, AT A GLANCE</span>
          <h1>Let’s move work forward.</h1>
          <p>A clear view of your priorities, clients, and team.</p>
        </div>
        <span className="workspace-badge">
          <span className="status-dot" />
          Workspace overview
        </span>
      </div>
      <section className="metrics" aria-label="Workspace metrics">
        {metrics.map((metric) => (
          <div className="metric" key={metric.label}>
            <div>
              <span>{metric.label}</span>
              <Icon name={metric.icon} />
            </div>
            <strong aria-label="Not yet available">—</strong>
            <small>{metric.hint}</small>
          </div>
        ))}
      </section>
      <p className="data-note">
        Your workspace is ready. Metrics will appear when task and client
        tracking is connected.
      </p>
      <div className="dashboard-grid">
        <section className="panel upcoming">
          <div className="panel-heading">
            <div>
              <h2>Upcoming Tasks</h2>
              <p>What needs your focus next.</p>
            </div>
            <Link className="text-link" href="/tasks">
              View tasks <Icon name="arrow" />
            </Link>
          </div>
          <div className="table-labels" aria-hidden="true">
            <span>TASK</span>
            <span>DUE DATE</span>
          </div>
          <EmptyState icon="tasks" title="A clear space for your next steps">
            Assigned tasks and upcoming deadlines will live here once task
            tracking is available.
          </EmptyState>
          <div className="panel-foot">
            <span className="tiny-dot" />
            No task data connected yet
          </div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent Activity</h2>
              <p>The latest across your workspace.</p>
            </div>
            <Icon name="activity" />
          </div>
          <EmptyState icon="activity" title="The story starts here">
            Task updates, project milestones, and team activity will appear
            here.
          </EmptyState>
          <Link href="/activity" className="panel-foot text-link">
            Open activity <Icon name="arrow" />
          </Link>
        </section>
      </div>
      <section className="workspace-section">
        <div>
          <span className="eyebrow">ONE PLACE FOR THE DETAILS</span>
          <h2>Your workspace, connected.</h2>
          <p>Keep the people and projects behind your work in view.</p>
        </div>
        <div className="quick-links">
          <Link href="/clients">
            <Icon name="clients" />
            <span>
              <strong>Client directory</strong>
              <small>A home for every relationship</small>
            </span>
            <Icon name="arrow" />
          </Link>
          <Link href="/projects">
            <Icon name="projects" />
            <span>
              <strong>Project workspace</strong>
              <small>Bring the bigger picture together</small>
            </span>
            <Icon name="arrow" />
          </Link>
        </div>
      </section>
    </>
  );
}
