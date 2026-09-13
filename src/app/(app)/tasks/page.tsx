import Link from "next/link";
import { directories, taskList } from "@/lib/data/queries";
import { taskStatuses, priorities, label } from "@/lib/data/constants";
import {
  PageHeading,
  Pagination,
  pageNumber,
  SelectField,
} from "@/components/work/shared";
import { TaskTable } from "@/components/work/task-table";
export default async function Tasks({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assignee?: string;
    client?: string;
    page?: string;
  }>;
}) {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const [directory, tasks] = await Promise.all([
    directories(),
    taskList({ ...filters, page }),
  ]);
  const query = new URLSearchParams();
  for (const key of ["status", "priority", "assignee", "client"] as const)
    if (filters[key]) query.set(key, filters[key]);
  return (
    <>
      <PageHeading
        title="Tasks"
        description="Choose a client, then scan their work by status, due date and assignee."
        href="/tasks/new"
        action="Create task"
      />
      <form className="filter-bar" action="/tasks" aria-label="Filter tasks by client, status and assignee">
        <SelectField name="client" title="Client" value={filters.client} empty="All clients"
          options={directory.clients.map((c) => ({ value: c.id, label: c.name }))} />

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
          options={priorities.map((value) => ({ value, label: label(value) }))}
        />
        <SelectField
          name="assignee"
          title="Assignee"
          value={filters.assignee}
          empty="All assignees"
          options={directory.members.map((m) => ({
            value: m.user_id,
            label: m.profiles?.full_name || `Member ${m.user_id.slice(0, 8)}`,
          }))}
        />
        <button className="button secondary">Apply filters</button>
        <Link className="text-link" href="/tasks">
          Clear
        </Link>
      </form>
      <section className="panel">
        <TaskTable tasks={tasks.rows} members={directory.members} />
        <Pagination page={page} count={tasks.count} href={`/tasks?${query}`} />
      </section>
    </>
  );
}
