"use client";
import { useActionState } from "react";
import type { WorkState } from "@/app/work-actions";
export function ActionForm({
  action,
  children,
  submit = "Save changes",
}: {
  action: (state: WorkState, form: FormData) => Promise<WorkState>;
  children: React.ReactNode;
  submit?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="work-form">
      <fieldset disabled={pending}>{children}</fieldset>
      {state.error && (
        <p role="alert" className="form-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="form-success">
          {state.success}
        </p>
      )}
      <button className="button primary" disabled={pending}>
        {pending ? "Saving…" : submit}
      </button>
    </form>
  );
}
