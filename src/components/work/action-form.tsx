"use client";
import { useActionState, useRef } from "react";
import type { WorkState } from "@/app/work-actions";
export function ActionForm({
  action,
  children,
  submit = "Save changes",
  resetOnSuccess = false,
}: {
  action: (state: WorkState, form: FormData) => Promise<WorkState>;
  children: React.ReactNode;
  submit?: string;
  resetOnSuccess?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (previous: WorkState, data: FormData) => {
      const result = await action(previous, data);
      if (resetOnSuccess && result.success) form.current?.reset();
      return result;
    },
    {},
  );
  return (
    <form
      ref={form}
      action={formAction}
      className="work-form"
      aria-busy={pending}
    >
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
