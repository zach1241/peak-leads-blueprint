"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { generateDeliverables } from "@/app/delivery-actions";
export function DeliveryGenerator() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const run = useCallback(
    () =>
      startTransition(async () => {
        try {
          const result = await generateDeliverables();
          setMessage(result.error || result.success || "");
        } catch {
          setMessage("Unable to check work periods. Try again.");
        }
      }),
    [],
  );
  useEffect(() => {
    run();
  }, [run]);
  return (
    <div className="delivery-generation">
      <p role="status">
        {pending ? "Checking current work periods…" : message}
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={run}
        disabled={pending}
      >
        Check periods
      </button>
    </div>
  );
}
