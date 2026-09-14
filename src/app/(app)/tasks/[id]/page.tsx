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
import { addComment } from "@/app/work-actions";
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
  const canUpdate = context.canAdmin || task.task_assignees.some(a => a.user_id === context.user.id);
  return (
    <>
      <Link href="/tasks" className="back-link">
        ← All tasks
      </Link>
      <PageHeading
        title={task.title}
        description="Task details and team discussion."
      />
      <div className="detail-badges">
        <Badge value={task.status} />
        <Badge value={task.priority} />
      </div>
      {task.deliverable_definition_id && (
        <section className="panel form-panel section-gap">
          <h2>Delivered quantity</h2>
          <p>
            Target: {task.target_min}
            {task.target_max !== task.target_min
              ? `–${task.target_max}`
              : ""}{" "}
            {task.target_unit} · {task.period_start} to {task.period_end}
          </p>
          <p className="data-note">
            Record actual delivery here. Reaching the minimum marks this task
            done; reducing the quantity reopens it.
          </p>
          {canUpdate && <ActionForm action={saveQuantity} submit="Save delivered quantity">
            <input type="hidden" name="id" value={task.id} />
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
          </ActionForm>}
          <Link
            href={`/delivery?client=${task.client_id}`}
            className="text-link"
          >
            View client delivery →
          </Link>
        </section>
      )}
      <section className="panel form-panel">
        {context.canAdmin ? <TaskForm task={task} directory={directory} /> : <><p>{task.description}</p>{canUpdate && <StatusEditor key={task.status + task.completed_quantity} id={task.id} status={task.status} quantity={task.completed_quantity} target={task.target_min} />}</>}
      </section>
      <section className="panel form-panel comments-panel">
        <h2>Comments</h2>
        <ActionForm action={addComment} submit="Add comment">
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
    </>
  );
}
