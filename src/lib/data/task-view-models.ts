export type TaskFilterClient = { id: string; name: string };
export type TaskFilterProject = {
  id: string;
  name: string;
  client_id: string | null;
  status: string;
  service_template_id: string | null;
};
export type TaskContextSelection = { client: string; project: string };
export type TaskViewMonth = { start: string; end: string; label: string };
type DatedTask = { due_date: string | null };
type PeriodTask = DatedTask & { period_start: string | null; period_end: string | null };

export function serviceFilterProjects(projects: TaskFilterProject[], client: string) {
  return projects.filter((project) =>
    project.status === "active" &&
    project.service_template_id &&
    (!client || project.client_id === client),
  );
}

// URL parameters can outlive a client/service link. Validate against the current
// workspace directory before sending those values into a task query.
export function validateTaskContextFilters<T extends TaskContextSelection>(
  filters: T,
  directory: { clients: TaskFilterClient[]; projects: TaskFilterProject[] },
): T {
  const invalidClient = Boolean(filters.client && !directory.clients.some((item) => item.id === filters.client));
  const client = invalidClient ? "" : filters.client;
  const project = !invalidClient && serviceFilterProjects(directory.projects, client)
    .some((item) => item.id === filters.project) ? filters.project : "";
  return { ...filters, client, project };
}

export function changeTaskFilterClient(client: string): TaskContextSelection {
  return { client, project: "" };
}

export function calendarTaskBuckets<T extends DatedTask>(tasks: T[], month: TaskViewMonth) {
  const byDate = new Map<string, T[]>();
  const outside: T[] = [];
  const undated: T[] = [];
  for (const task of tasks) {
    if (!task.due_date) undated.push(task);
    else if (task.due_date < month.start || task.due_date > month.end) outside.push(task);
    else {
      const rows = byDate.get(task.due_date) || [];
      rows.push(task);
      byDate.set(task.due_date, rows);
    }
  }
  return { byDate, outside, undated };
}

function dateOffset(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000);
}

// A due date without a work period is a single-day milestone. Clip full dates
// first: using day-of-month alone loses weeks that cross a month/year boundary.
export function taskTimelinePlacement(task: PeriodTask, month: TaskViewMonth) {
  const start = task.period_start || task.due_date;
  const end = task.period_start ? (task.period_end || task.period_start) : task.due_date;
  if (!start || !end || end < start) return null;
  const visibleStart = start < month.start ? month.start : start;
  const visibleEnd = end > month.end ? month.end : end;
  return {
    start,
    end,
    milestone: start === end,
    visible: visibleStart <= visibleEnd,
    startColumn: dateOffset(month.start, visibleStart) + 1,
    span: dateOffset(visibleStart, visibleEnd) + 1,
  };
}
