import { AssigneeEditor } from "./assignee-editor";
import Link from "next/link";
import { displayDate } from "@/lib/data/constants";
import type { taskList, Directory } from "@/lib/data/queries";
import { Badge } from "./shared";
import { EmptyState } from "@/components/empty-state";
export function TaskTable({
  tasks,
  members,
  assignmentOrganizationId,
}: {
  tasks: Awaited<ReturnType<typeof taskList>>["rows"];
  members: Directory["members"];
  assignmentOrganizationId?: string;
}) {
  if (!tasks.length)
    return (
      <EmptyState icon="tasks" title="No tasks to show">
        Create your first task or adjust your filters.
      </EmptyState>
    );
  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tasks table"
    >
      <table className="data-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignees</th>
            <th>Client / service</th>
            <th>Due date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td>
                <Link className="record-link" href={`/tasks/${task.id}`}>
                  {task.service_deliverables?.name || task.title}
                </Link>
                {task.deliverable_definition_id && <small>{task.completed_quantity} / {task.target_min}{task.target_max !== task.target_min ? `–${task.target_max}` : ""} {task.target_unit} {task.service_deliverables?.cadence === "weekly" ? "per week" : "per month"} · {task.period_start} – {task.period_end}</small>}
              </td>
              <td>
                <Badge value={task.status} />
              </td>
              <td>
                <Badge value={task.priority} />
              </td>
              <td>
                {assignmentOrganizationId ? <AssigneeEditor
                  key={task.id + ":" + task.task_assignees.map(a => a.user_id).sort().join(",")}
                  taskId={task.id} organizationId={assignmentOrganizationId}
                  assigned={task.task_assignees.map(a => a.user_id)}
                  members={members.map(m => ({ id: m.user_id, name: m.profiles?.full_name || `Member ${m.user_id.slice(0, 8)}` }))}
                /> : task.task_assignees
                  .map(
                    (a) =>
                      members.find((m) => m.user_id === a.user_id)?.profiles
                        ?.full_name || "Team member",
                  )
                  .join(", ") || "Unassigned"}
              </td>
              <td>
                {task.clients?.name ?? "No client"}
                <small>{task.projects?.name ?? "No service / project"}</small>
              </td>
              <td className="nowrap">{displayDate(task.due_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
