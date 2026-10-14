import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/data/workspace";
import { DeliveryGenerator } from "@/components/work/delivery-generator";
import { directories, taskList, taskListAll } from "@/lib/data/queries";
import {
  normalizeTaskFilters,
  taskFilterParams,
  workspaceMonth,
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
import { GroupedTaskList } from "@/components/work/grouped-task-list";
import { TaskBoard, TaskCalendar, TaskGantt } from "@/components/work/task-visualizations";
import { TaskContextFilters } from "@/components/work/task-context-filters";
import { validateTaskContextFilters } from "@/lib/data/task-view-models";

const views = [
  {
    value: "active",
    title: "This month",
    description:
      "Actionable deliverables for this month, grouped by client and service.",
  },
  {
    value: "mine",
    title: "My tasks",
    description: "Your unfinished assigned deliverables for this month.",
  },
  {
    value: "overdue",
    title: "Overdue",
    description: "This month’s unfinished deliverables past their due date.",
  },
  {
    value: "unassigned",
    title: "Unassigned",
    description: "This month’s deliverables that need an owner.",
  },
];

export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organization, canAdmin } = await requireWorkspace();
  const raw = await searchParams;
  const directory = await directories();
  const filters = validateTaskContextFilters(normalizeTaskFilters(raw), directory);
  // Legacy History links must not reopen prior-month work in this monthly queue.
  if (filters.view === "history") filters.view = "active";
  const month = workspaceMonth();
  const layout = filters.layout;
  const grouped = layout !== "list";
  const page = pageNumber(typeof raw.page === "string" ? raw.page : undefined);
  const [tasks, services, templates] = await Promise.all([
    grouped
      ? taskListAll({ ...filters, deliverablesOnly: true })
      : taskList({ ...filters, page, deliverablesOnly: true }),
    canAdmin ? serviceAssignmentOptions() : Promise.resolve([]),
    canAdmin ? serviceTemplates() : Promise.resolve([]),
  ]);
  const query = taskFilterParams(filters);
  const lastPage = Math.max(1, Math.ceil(tasks.count / 25));
  if (!grouped && page > lastPage) {
    query.set("page", String(lastPage));
    redirect(`/tasks?${query}`);
  }
  const selectedView = views.find((view) => view.value === filters.view)!;
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
        title="Deliverable tasks"
        description={`${month.label} · Track actionable service deliverables, owners and progress.`}
        href={undefined}
        action="Create task"
      />
      <div className="task-view-controls">
        <nav className="task-views" aria-label="Task views">
          {views.map((view) => {
            const params = new URLSearchParams(query);
            params.set("view", view.value);
            if (view.value === "mine" || view.value === "unassigned")
              params.delete("assignee");
            if (
              ["mine", "overdue", "unassigned"].includes(view.value) &&
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
        <nav className="task-layouts" aria-label="Task layout">
          {[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
            { value: "calendar", label: "Calendar" },
            { value: "gantt", label: "Gantt" },
          ].map(option => {
            const params = new URLSearchParams(query);
            params.set("layout", option.value);
            params.delete("page");
            return <Link key={option.value} href={`/tasks?${params}`} aria-current={layout === option.value ? "page" : undefined}>{option.label}</Link>;
          })}
        </nav>
      </div>
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
            <p>
              {`${month.label} · ${selectedView.description}`}
            </p>
          </div>
          {filtered && (
            <Link
              className="text-link"
              href={`/tasks?view=${filters.view}&layout=${layout}`}
            >
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
            <input type="hidden" name="layout" value={layout} />
            <label className="task-search">
              Search deliverables
              <input
                type="search"
                name="q"
                placeholder="Search by task title…"
                defaultValue={filters.q}
                maxLength={120}
              />
            </label>
            <TaskContextFilters
              key={`${filters.client}:${filters.project}`}
              clients={directory.clients}
              projects={directory.projects}
              client={filters.client}
              project={filters.project}
            />
            <SelectField
              name="status"
              title="Status"
              value={filters.status}
              empty="All statuses"
              options={taskStatuses
                .filter(
                  (value) =>
                    !["mine", "overdue", "unassigned"].includes(filters.view) ||
                    !["done", "cancelled"].includes(value),
                )
                .map((value) => ({
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
        {layout === "board" ? (
          <TaskBoard tasks={tasks.rows} canEditStatus />
        ) : layout === "calendar" ? (
          <TaskCalendar tasks={tasks.rows} month={month} />
        ) : layout === "gantt" ? (
          <TaskGantt tasks={tasks.rows} month={month} />
        ) : layout === "grouped" ? (
          <GroupedTaskList
            tasks={tasks.rows}
            members={directory.members}
            assignmentOrganizationId={canAdmin ? organization.id : undefined}
            editableStatus
            statusUserId={undefined}
            expandAll={Boolean(filters.client || filters.project || filters.q)}
            emptyDescription={
              filtered
                ? "No deliverables match these filters. Clear filters or try a different search."
                : "No deliverables in this view yet."
            }
          />
        ) : (
          <TaskTable
            editableStatus
            tasks={tasks.rows}
            members={directory.members}
            assignmentOrganizationId={canAdmin ? organization.id : undefined}
            emptyDescription={
              filtered
                ? "No deliverables match these filters. Clear filters or try a different search."
                : filters.view === "mine"
                  ? "You have no unfinished deliverables assigned to you."
                  : filters.view === "overdue"
                    ? "No overdue tasks. Your deadlines are on track."
                    : "No deliverables in this view yet."
            }
          />
        )}
        {layout === "list" && (
          <Pagination
            page={page}
            count={tasks.count}
            href={`/tasks?${query}`}
          />
        )}
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
