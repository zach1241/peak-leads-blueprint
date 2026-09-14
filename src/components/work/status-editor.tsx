"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTaskStatus } from "@/app/work-actions";
export function StatusEditor({ id, status, quantity, target }: { id: string; status: string; quantity: number; target: number | null }) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState("");
  async function save(next: string, delivered?: number) {
    setPending(true); setError("");
    const form = new FormData(); form.set("id", id); form.set("status", next);
    if (delivered !== undefined) form.set("quantity", String(delivered));
    try { const result = await updateTaskStatus(form); if (result.error) setError(result.error); else { setCurrent(next); setConfirm(false); router.refresh(); } }
    catch { setError("Unable to save status. Try again."); } finally { setPending(false); }
  }
  return <div>
    <select className="task-status-select" aria-label="Task status" value={current} disabled={pending} onChange={event => {
      const next = event.target.value;
      if (next === "done" && target !== null && quantity < target) { setConfirm(true); setError(""); return; }
      setConfirm(false); void save(next);
    }}>
      {!['todo','in_progress','review','done'].includes(current) && <option value={current}>{current}</option>}
      <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="review">Review</option><option value="done">Done</option>
    </select>
    {confirm && <div><small>This records {target} delivered for this task.</small><button type="button" className="button secondary" disabled={pending} onClick={() => void save("done", target!)}>Confirm Done</button><button type="button" className="text-link" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button></div>}
    {pending && <small role="status">Saving…</small>}{error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}
