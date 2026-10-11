import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/data/workspace";
import { DeliveryGenerator } from "@/components/work/delivery-generator";
import { directories, taskList } from "@/lib/data/queries";
import {
  normalizeTaskFilters,
  taskFilterParams,
} from "@/lib/data/task-filters";
import {
  serviceAssignmentOptions,
  serviceTemplates,
} from "@/lib/data/service-assignments";
import { ServiceAssignmentEditor } from "@/components/work/service-assignment-editor";
import { taskStatuses, priorities, label } from "@/lib/data/constants";
import {
  PageHeading,
  Pagination,
  pageNumber,
  SelectField,
} from "@/components/work/shared";
import { TaskTable } from "@/components/work/task-table";

const views = [
  {
    value: "active",
    title: "Current work",
    description:
      "Current periods and unfinished earlier work. Completed past periods are in History.",
  },
  {
    value: "mine",
    title: "My tasks",
    description:
      "Your unfinished work, including tasks carried over from earlier periods.",
  },
  {
    value: "overdue",
    title: "Overdue",
    description: "Unfinished tasks with a deadline before today.",
  },
  {
    value: "unassigned",
    title: "Unassigned",
    description: "Current and carried-over work that needs an owner.",
  },
  {
    value: "history",
    title: "History",
    description:
      "All work periods, including completed, cancelled and future tasks.",
  },
];

export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, canAdmin, user } = await requireWorkspace();
  const raw = await searchParams;
  const filters = normalizeTaskFilters(raw);
  const page = pageNumber(typeof raw.page === "string" ? raw.page : undefined);
  const [directory, tasks, services, templates] = await Promise.all([
    directories(),
    taskList({ ...filters, page }),
    canAdmin ? serviceAssignmentOptions() : Promise.resolve([]),
    canAdmin ? serviceTemplates() : Promise.resolve([]),
  ]);
  const query = taskFilterParams(filters);
  const lastPage = Math.max(1, Math.ceil(tasks.count / 25));
  if (page > lastPage) {
    query.set("page", String(lastPage));
    redirect(`/tasks?${query}`);
  }
  const selectedView = views.find((view) => view.value === filters.view)!;
  const clients = new Map(
    directory.clients.map((client) => [client.id, client.name]),
  );
  const filtered = Boolean(
    filters.q ||
    filters.status ||
    filters.priority ||
    filters.client ||
    filters.project ||
    filters.due ||
    filters.assignee,
  );
  return (
    <>
      <PageHeading
        title="Tasks"
        description="Find the next step, give it an owner, and keep work moving."
        href={canAdmin ? "/tasks/new" : undefined}
        action="Create task"
      />
      <nav className="task-views" aria-label="Task views">
        {views.map((view) => {
          const params = new URLSearchParams(query);
          params.set("view", view.value);
          if (view.value === "mine" || view.value === "unassigned")
            params.delete("assignee");
          if (
            (view.value === "mine" || view.value === "overdue") &&
            ["done", "cancelled"].includes(filters.status)
          )
            params.delete("status");
          return (
            <Link
              key={view.value}
              href={`/tasks?${params}`}
              aria-current={filters.view === view.value ? "page" : undefined}
            >
              {view.title}
            </Link>
          );
        })}
      </nav>
      <section
        className="panel task-workspace"
        aria-labelledby="task-list-heading"
      >
        <div className="panel-heading">
          <div>
            <h2 id="task-list-heading">
              {selectedView.title}{" "}
              <span className="count-pill">{tasks.count}</span>
            </h2>
            <p>{selectedView.description}</p>
          </div>
          {filtered && (
            <Link className="text-link" href={`/tasks?view=${filters.view}`}>
              Clear filters
            </Link>
          )}
        </div>
        <details
          key={query.toString()}
          className="task-filter-details"
          open={filtered}
        >
          <summary>Search and filters{filtered ? " · Applied" : ""}</summary>
          <form
            className="filter-bar task-filters"
            action="/tasks"
            aria-label="Filter tasks"
          >
            <input type="hidden" name="view" value={filters.view} />
            <label className="task-search">
              Search tasks
              <input
                type="search"
                name="q"
                placeholder="Search by task title…"
                defaultValue={filters.q}
                maxLength={120}
              />
            </label>
            <SelectField
              name="client"
              title="Client"
              value={filters.client}
              empty="All clients"
              options={directory.clients.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
            <SelectField
              name="project"
              title="Service / project"
              value={filters.project}
              empty="All services"
              options={directory.projects.map((p) => ({
                value: p.id,
                label: `${p.name}${p.client_id ? ` · ${clients.get(p.client_id) || "Client"}` : ""}`,
              }))}
            />
            <SelectField
              name="status"
              title="Status"
              value={filters.status}
              empty="All statuses"
              options={taskStatuses.map((value) => ({
                value,
                label: label(value),
              }))}
            />
            <SelectField
              name="priority"
              title="Priority"
              value={filters.priority}
              empty="All priorities"
              options={priorities.map((value) => ({
                value,
                label: label(value),
              }))}
            />
            {filters.view !== "mine" && filters.view !== "unassigned" && (
              <SelectField
                name="assignee"
                title="Assignee"
                value={filters.assignee}
                empty="All assignees"
                options={directory.members.map((m) => ({
                  value: m.user_id,
                  label: m.profiles?.full_name || "Team member",
                }))}
              />
            )}
            {filters.view !== "overdue" && (
              <SelectField
                name="due"
                title="Due date"
                value={filters.due}
                empty="Any date"
                options={[
                  { value: "today", label: "Today" },
                  { value: "week", label: "This week" },
                  { value: "overdue", label: "Overdue" },
                  { value: "undated", label: "No due date" },
                ]}
              />
            )}
            <SelectField
              name="sort"
              title="Sort by"
              value={filters.sort}
              options={[
                { value: "due", label: "Due date" },
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
                { value: "title", label: "Task title" },
              ]}
            />
            <button className="button secondary">Apply filters</button>
          </form>
        </details>
        <TaskTable
          statusUserId={canAdmin ? undefined : user.id}
          editableStatus
          tasks={tasks.rows}
          members={directory.members}
          assignmentOrganizationId={canAdmin ? organization.id : undefined}
          emptyDescription={
            filtered
              ? "No tasks match these filters. Clear filters or try a different search."
              : filters.view === "mine"
                ? "You have no unfinished tasks assigned to you."
                : filters.view === "overdue"
                  ? "No overdue tasks. Your deadlines are on track."
                  : "No tasks in this view yet."
          }
        />
        <Pagination page={page} count={tasks.count} href={`/tasks?${query}`} />
      </section>
      {canAdmin && (
        <section className="section-gap" aria-label="Service work tools">
          <ServiceAssignmentEditor
            organizationId={organization.id}
            services={services}
            members={directory.members}
            clients={directory.clients}
            templates={templates}
          />
          <DeliveryGenerator organizationId={organization.id} />
        </section>
      )}
    </>
  );
}
