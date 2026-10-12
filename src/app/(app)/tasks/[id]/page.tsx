import { StatusEditor } from "@/components/work/status-editor";
import Link from "next/link";
import { saveQuantity } from "@/app/delivery-actions";
import { directories, taskDetail } from "@/lib/data/queries";
import { requireWorkspace } from "@/lib/data/workspace";
import { TaskForm } from "@/components/work/forms";
import {
  PageHeading,
  Badge,
  Pagination,
  pageNumber,
} from "@/components/work/shared";
import { ActionForm } from "@/components/work/action-form";
import { addComment, deleteTask } from "@/app/work-actions";
import deletionStyles from "./task-deletion.module.css";
import { displayDate } from "@/lib/data/constants";
import { AssigneeAvatars } from "@/components/work/assignee-editor";
export default async function Task({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const page = pageNumber((await searchParams).page);
  const [task, directory, context] = await Promise.all([
    taskDetail(id),
    directories(),
    requireWorkspace(),
  ]);
  const {
    data: comments,
    error,
    count,
  } = await context.db
    .from("comments")
    .select("*,profiles(full_name)", { count: "exact" })
    .eq("organization_id", context.organization.id)
    .eq("task_id", id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Unable to load comments.");
  const canUpdate = true;
  return (
    <>
      <Link href="/tasks" className="back-link">
        ← All tasks
      </Link>
      <PageHeading
        title={task.service_deliverables?.name || task.title}
        description="Task details and team discussion."
      />
      <div className="detail-badges">
        {canUpdate ? (
          <StatusEditor
            key={task.updated_at}
            id={task.id}
            updatedAt={task.updated_at}
            title={task.title}
            status={task.status}
            quantity={task.completed_quantity}
            target={task.target_min}
          />
        ) : (
          <Badge value={task.status} />
        )}
        <Badge value={task.priority} />
      </div>
      <section
        className="panel form-panel task-summary"
        aria-label="Task details"
      >
        <dl className="task-facts">
          <div>
            <dt>Due date</dt>
            <dd>{displayDate(task.due_date)}</dd>
          </div>
          <div>
            <dt>Client</dt>
            <dd>
              {task.client_id ? (
                <Link className="text-link" href={`/clients/${task.client_id}`}>
                  {task.clients?.name || "View client"}
                </Link>
              ) : (
                "No client"
              )}
            </dd>
          </div>
          <div>
            <dt>Service / project</dt>
            <dd>
              {task.project_id ? (
                <Link
                  className="text-link"
                  href={`/projects/${task.project_id}`}
                >
                  {task.projects?.name || "View project"}
                </Link>
              ) : (
                "No service / project"
              )}
            </dd>
          </div>
          <div>
            <dt>Assignees</dt>
            <dd>
              <AssigneeAvatars
                assigned={task.task_assignees.map((a) => a.user_id)}
                members={directory.members.map((m) => ({
                  id: m.user_id,
                  name: m.profiles?.full_name || "Team member",
                  avatarUrl: m.profiles?.avatar_url,
                }))}
              />
            </dd>
          </div>
        </dl>
        <div className="task-description">
          <h2>Description</h2>
          <p>{task.description || "No description added yet."}</p>
        </div>
        {task.recurrence_parent_id && (
          <p className="data-note">
            <Link
              className="text-link"
              href={`/tasks/${task.recurrence_parent_id}`}
            >
              View repeating task →
            </Link>
          </p>
        )}
      </section>
      {task.deliverable_definition_id && (
        <section className="panel form-panel section-gap">
          <h2>Delivered quantity</h2>
          <p>
            Target: {task.target_min}
            {task.target_max !== task.target_min
              ? `–${task.target_max}`
              : ""}{" "}
            {task.target_unit} · {displayDate(task.period_start)} to{" "}
            {displayDate(task.period_end)}
          </p>
          <p className="data-note">
            Record actual delivery here. Reaching the minimum marks this task
            done; reducing the quantity reopens it.
          </p>
          {context.canAdmin && (
            <ActionForm
              key={task.updated_at}
              action={saveQuantity}
              submit="Save delivered quantity"
            >
              <input type="hidden" name="id" value={task.id} />
              <input
                type="hidden"
                name="expected_updated_at"
                value={task.updated_at}
              />
              <label>
                Completed quantity
                <input
                  name="quantity"
                  type="number"
                  min={0}
                  max={task.target_max ?? undefined}
                  step={1}
                  required
                  defaultValue={task.completed_quantity}
                />
              </label>
            </ActionForm>
          )}
          {task.client_id && (
            <Link
              href={`/delivery?client=${task.client_id}`}
              className="text-link"
            >
              View client delivery →
            </Link>
          )}
        </section>
      )}
      {context.canAdmin && (
        <details className="panel form-panel section-gap edit-details">
          <summary>Edit task settings</summary>
          <TaskForm key={task.updated_at} task={task} directory={directory} />
        </details>
      )}
      <section className="panel form-panel comments-panel">
        <h2>Comments</h2>
        <ActionForm action={addComment} submit="Add comment" resetOnSuccess>
          <input type="hidden" name="task_id" value={task.id} />
          <label>
            Write a comment
            <textarea name="body" required maxLength={10000} rows={3} />
          </label>
        </ActionForm>
        <div className="comment-list">
          {comments?.length ? (
            comments.map((c) => (
              <article key={c.id}>
                <div>
                  <strong>{c.profiles?.full_name || "Team member"}</strong>
                  <time dateTime={c.created_at}>
                    {new Date(c.created_at).toLocaleString("en-ZA", {
                      timeZone: "Africa/Johannesburg",
                    })}
                  </time>
                </div>
                <p>{c.body}</p>
              </article>
            ))
          ) : (
            <p className="muted">No comments yet. Start the conversation.</p>
          )}
        </div>
        <Pagination page={page} count={count ?? 0} href={`/tasks/${id}`} />
      </section>
      {context.canAdmin && (
        <details
          className={`panel form-panel section-gap ${deletionStyles.dangerArea}`}
        >
          <summary>Delete task</summary>
          <p className={deletionStyles.description}>
            Permanently delete this task, its comments and assignments. Other
            tasks are kept.
          </p>
          {task.recurrence_type !== "none" ? (
            <p className={deletionStyles.description}>
              Deleting the original repeating task stops its future occurrences.
              If it already has generated occurrences, keep their history and
              choose Does not repeat or change Repeat until in the task settings
              instead.
            </p>
          ) : (
            (task.deliverable_definition_id || task.recurrence_parent_id) && (
              <p className={deletionStyles.description}>
                This occurrence stays deleted. Other occurrences and the future
                recurring schedule are kept.
              </p>
            )
          )}
          <ActionForm action={deleteTask} submit="Delete task permanently">
            <input type="hidden" name="id" value={task.id} />
            <input
              type="hidden"
              name="organization_id"
              value={context.organization.id}
            />
            <label className={deletionStyles.confirmation}>
              <input type="checkbox" name="confirm" value="yes" required />I
              confirm permanent deletion of this task and its comments and
              assignments.
            </label>
          </ActionForm>
        </details>
      )}
    </>
  );
}
