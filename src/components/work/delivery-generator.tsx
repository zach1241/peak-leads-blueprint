"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { generateDeliverables } from "@/app/delivery-actions";
import { workspaceCalendar } from "@/lib/data/task-filters";
import type { WorkState } from "@/app/work-actions";

// Share the first check across navigation and Strict Mode remounts in this tab.
const checks = new Map<string, Promise<WorkState>>();
export function DeliveryGenerator({
  organizationId,
}: {
  organizationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<WorkState>({});
  const run = useCallback(
    (manual = false) => {
      startTransition(async () => {
        const key = `${organizationId}:${workspaceCalendar().today}`;
        try {
          let request = checks.get(key);
          if (manual || !request) {
            request = generateDeliverables(organizationId);
            checks.set(key, request);
          }
          const state = await request;
          if (state.error) checks.delete(key);
          setResult(state);
        } catch {
          checks.delete(key);
          setResult({ error: "Unable to refresh recurring work. Try again." });
        }
      });
    },
    [organizationId],
  );
  useEffect(() => {
    run();
  }, [run]);
  return (
    <div className="delivery-generation" aria-busy={pending}>
      <p
        role={result.error ? "alert" : "status"}
        className={result.error ? "form-error" : "muted"}
      >
        {pending
          ? "Refreshing recurring work…"
          : result.error || result.success || "Recurring work"}
      </p>
      <button
        type="button"
        className="text-link"
        onClick={() => run(true)}
        disabled={pending}
      >
        Refresh recurring work
      </button>
    </div>
  );
}
