"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus } from "@/app/work-actions";
import { taskStatuses, label } from "@/lib/data/constants";

export function StatusEditor({
  id,
  updatedAt,
  title = "Task",
  status,
  quantity,
  target,
}: {
  id: string;
  updatedAt: string;
  title?: string;
  status: string;
  quantity: number;
  target: number | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  async function save(next: string, delivered?: number) {
    setPending(true);
    setError("");
    const form = new FormData();
    form.set("id", id);
    form.set("status", next);
    form.set("expected_updated_at", updatedAt);
    if (delivered !== undefined) form.set("quantity", String(delivered));
    try {
      const result = await updateTaskStatus(form);
      if (result.error) setError(result.error);
      else {
        setCurrent(next);
        setConfirm(false);
        router.refresh();
      }
    } catch {
      setError("Unable to save status. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="status-editor" aria-busy={pending}>
      <select
        className={`task-status-select status-${current}`}
        aria-label={`Status for ${title}`}
        value={current}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "done" && target !== null && quantity < target) {
            setConfirm(true);
            setError("");
            return;
          }
          setConfirm(false);
          void save(next);
        }}
      >
        {taskStatuses.map((value) => (
          <option key={value} value={value}>
            {label(value)}
          </option>
        ))}
      </select>
      {confirm && (
        <div className="status-confirmation">
          <small>Mark done and record {target} delivered?</small>
          <div>
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={() => void save("done", target!)}
            >
              Confirm done
            </button>
            <button
              type="button"
              className="text-link"
              disabled={pending}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {pending && <small role="status">Saving…</small>}
      {error && (
        <small className="form-error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-link"
            onClick={() => router.refresh()}
          >
            Refresh task
          </button>
        </small>
      )}
    </div>
  );
}
