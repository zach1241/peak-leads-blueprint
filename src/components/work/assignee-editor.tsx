"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaskAssignees } from "@/app/work-actions";
import { Avatar } from "@/components/avatar";
import styles from "./assignee-editor.module.css";

type Member = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export function AssigneeAvatars({
  assigned,
  members,
  maxVisible = 3,
}: {
  assigned: string[];
  members: Member[];
  maxVisible?: number;
}) {
  const assignedMembers = assigned
    .map((id) => members.find((member) => member.id === id))
    .filter((member): member is Member => Boolean(member));

  if (!assignedMembers.length) {
    return <span className={styles.unassigned}>Unassigned</span>;
  }

  const visible = assignedMembers.slice(0, maxVisible);
  const remaining = assignedMembers.length - visible.length;

  return (
    <span
      className={styles.avatarGroup}
      aria-label={`Assigned to ${assignedMembers
        .map((member) => member.name)
        .join(", ")}`}
    >
      {visible.map((member) => (
        <span
          key={member.id}
          className={styles.avatarItem}
          title={member.name}
        >
          <Avatar
            name={member.name}
            url={member.avatarUrl}
          />
        </span>
      ))}

      {remaining > 0 && (
        <span
          className={styles.moreAvatar}
          title={assignedMembers
            .slice(maxVisible)
            .map((member) => member.name)
            .join(", ")}
        >
          +{remaining}
        </span>
      )}
    </span>
  );
}

export function AssigneeEditor({
  taskId,
  organizationId,
  assigned,
  members,
}: {
  taskId: string;
  organizationId: string;
  assigned: string[];
  members: Member[];
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  const [saved, setSaved] = useState(assigned);
  const [selected, setSelected] = useState(assigned);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState({
    top: 16,
    left: 16,
  });

  const label =
    saved
      .map(
        (id) =>
          members.find((member) => member.id === id)?.name ||
          "Team member",
      )
      .join(", ") || "Unassigned";

  async function save(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (pending) return;

    setPending(true);
    setError("");

    const form = new FormData();

    form.set("task_id", taskId);
    form.set("organization_id", organizationId);

    selected.forEach((id) =>
      form.append("assignees", id),
    );

    try {
      const result = await updateTaskAssignees(form);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved(selected);
      setMessage("Assignments saved.");
      dialog.current?.close();
      router.refresh();
    } catch {
      setError(
        "Unable to save assignments. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="dialog"
        aria-label={`Edit assignees: ${label}`}
        title={label}
        onClick={(event) => {
          const rect =
            event.currentTarget.getBoundingClientRect();

          setPosition({
            left: Math.max(
              16,
              Math.min(
                rect.left,
                window.innerWidth - 336,
              ),
            ),
            top: Math.max(
              16,
              Math.min(
                rect.bottom + 6,
                window.innerHeight - 376,
              ),
            ),
          });

          setSelected(saved);
          setError("");
          setMessage("");
          dialog.current?.showModal();
        }}
      >
        <AssigneeAvatars
          assigned={saved}
          members={members}
        />

        <span
          className={styles.chevron}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      <span
        className={styles.announcement}
        role="status"
      >
        {message}
      </span>

      <dialog
        ref={dialog}
        className={styles.popover}
        style={position}
        aria-labelledby={`assignee-title-${taskId}`}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        onClick={(event) => {
          if (
            !pending &&
            event.target === event.currentTarget
          ) {
            dialog.current?.close();
          }
        }}
      >
        <form
          onSubmit={save}
          aria-busy={pending}
        >
          <h3 id={`assignee-title-${taskId}`}>
            Assign task
          </h3>

          <fieldset
            disabled={pending}
            className={styles.options}
          >
            <legend>
              Select workspace members
            </legend>

            <label>
              <input
                type="checkbox"
                checked={selected.length === 0}
                onChange={() => setSelected([])}
              />
              Unassigned
            </label>

            {members.map((member) => (
              <label key={member.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(
                    member.id,
                  )}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, member.id]
                        : current.filter(
                            (id) =>
                              id !== member.id,
                          ),
                    )
                  }
                />

                <Avatar
                  name={member.name}
                  url={member.avatarUrl}
                />

                <span>{member.name}</span>
              </label>
            ))}

            {!members.length && (
              <p>
                No eligible members in this
                workspace.
              </p>
            )}
          </fieldset>

          {error && (
            <p
              className="form-error"
              role="alert"
            >
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              className="button primary"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save"}
            </button>

            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() =>
                dialog.current?.close()
              }
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}