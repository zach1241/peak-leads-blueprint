import { StatusEditor } from "./status-editor";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { displayDate } from "@/lib/data/constants";
import { workspaceCalendar } from "@/lib/data/task-filters";
import type { Directory, taskList } from "@/lib/data/queries";

import { AssigneeAvatars, AssigneeEditor } from "./assignee-editor";
import { Badge } from "./shared";

export function TaskTable({
  tasks,
  members,
  assignmentOrganizationId,
  editableStatus = false,
  statusUserId,
  emptyDescription = "Create your first task or adjust your filters.",
}: {
  tasks: Awaited<ReturnType<typeof taskList>>["rows"];
  members: Directory["members"];
  assignmentOrganizationId?: string;
  editableStatus?: boolean;
  statusUserId?: string;
  emptyDescription?: string;
}) {
  if (!tasks.length) {
    return (
      <EmptyState icon="tasks" title="No tasks to show">
        {emptyDescription}
      </EmptyState>
    );
  }

  const { today } = workspaceCalendar();
  const assignmentMembers = members.map((member) => ({
    id: member.user_id,
    name: member.profiles?.full_name || `Member ${member.user_id.slice(0, 8)}`,
    avatarUrl: member.profiles?.avatar_url ?? null,
  }));

  return (
    <div
      className="table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Tasks table"
    >
      <table className="data-table task-table">
        <caption className="sr-only">
          Tasks, status, priority, owners and deadlines
        </caption>
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
          {tasks.map((task) => {
            const assignedIds = task.task_assignees.map(
              (assignee) => assignee.user_id,
            );
            const overdue = Boolean(
              task.due_date &&
              task.due_date < today &&
              !["done", "cancelled"].includes(task.status),
            );

            return (
              <tr key={task.id}>
                <td data-label="Task">
                  <Link className="record-link" href={`/tasks/${task.id}`}>
                    {task.service_deliverables?.name || task.title}
                  </Link>

                  {task.deliverable_definition_id && (
                    <small>
                      {task.completed_quantity} / {task.target_min}
                      {task.target_max !== task.target_min
                        ? `–${task.target_max}`
                        : ""}{" "}
                      {task.target_unit}{" "}
                      {task.service_deliverables?.cadence === "weekly"
                        ? "per week"
                        : "per month"}{" "}
                      · {displayDate(task.period_start)} –{" "}
                      {displayDate(task.period_end)}
                    </small>
                  )}
                </td>

                <td data-label="Status">
                  {editableStatus &&
                  (!statusUserId || assignedIds.includes(statusUserId)) ? (
                    <StatusEditor
                      key={task.id + task.updated_at}
                      id={task.id}
                      updatedAt={task.updated_at}
                      title={task.service_deliverables?.name || task.title}
                      status={task.status}
                      quantity={task.completed_quantity}
                      target={task.target_min}
                    />
                  ) : (
                    <Badge value={task.status} />
                  )}
                </td>

                <td data-label="Priority">
                  <Badge value={task.priority} />
                </td>

                <td data-label="Assignees">
                  {assignmentOrganizationId ? (
                    <AssigneeEditor
                      key={`${task.id}:${[...assignedIds].sort().join(",")}`}
                      recurring={Boolean(
                        task.deliverable_definition_id ||
                        task.recurrence_parent_id ||
                        task.recurrence_type !== "none",
                      )}
                      taskId={task.id}
                      organizationId={assignmentOrganizationId}
                      assigned={assignedIds}
                      members={assignmentMembers}
                    />
                  ) : (
                    <AssigneeAvatars
                      assigned={assignedIds}
                      members={assignmentMembers}
                    />
                  )}
                </td>

                <td data-label="Client / service">
                  {task.client_id ? (
                    <Link
                      className="record-link"
                      href={`/clients/${task.client_id}`}
                    >
                      {task.clients?.name ?? "Client"}
                    </Link>
                  ) : (
                    "No client"
                  )}
                  <small>
                    {task.project_id ? (
                      <Link href={`/projects/${task.project_id}`}>
                        {task.projects?.name ?? "Project"}
                      </Link>
                    ) : (
                      "No service / project"
                    )}
                  </small>
                </td>

                <td data-label="Due date" className="nowrap">
                  <span className={overdue ? "overdue-date" : undefined}>
                    {task.due_date ? (
                      <time dateTime={task.due_date}>
                        {displayDate(task.due_date)}
                      </time>
                    ) : (
                      "No due date"
                    )}
                  </span>
                  {overdue && <small className="overdue-date">Overdue</small>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
