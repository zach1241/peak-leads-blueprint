"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { login, resetPassword, type AuthState } from "@/app/actions";
import { createClient } from "@/lib/supabase/browser";
export function AuthForm({
  mode,
  next = "/dashboard",
}: {
  mode: "login" | "reset";
  next?: string;
}) {
  const [state, action, pending] = useActionState(
    mode === "login" ? login : resetPassword,
    {},
  );
  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="next" value={next} />
      {mode === "login" && (
        <label>
          Work email
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@peakleads.com"
            required
            maxLength={254}
          />
        </label>
      )}
      <label>
        {mode === "login" ? "Password" : "New password"}
        <input
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={mode === "reset" ? 12 : undefined}
          maxLength={256}
        />
      </label>
      {mode === "reset" && (
        <>
          <p className="field-hint">Use at least 12 characters.</p>
          <label>
            Confirm new password
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={256}
              required
            />
          </label>
        </>
      )}
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      {state.success ? (
        <div role="status">
          <p className="form-success">{state.success}</p>
          <Link className="button primary" href="/dashboard">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <button className="button primary" disabled={pending}>
          {pending
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Update password"}
        </button>
      )}
      {mode === "login" && (
        <Link className="auth-link" href="/forgot-password">
          Forgot your password?
        </Link>
      )}
    </form>
  );
}
export function ForgotPasswordForm() {
  const [state, setState] = useState<AuthState>({});
  const [pending, setPending] = useState(false);
  return (
    <form
      className="auth-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const email = String(
          new FormData(event.currentTarget).get("email") ?? "",
        ).trim();
        setPending(true);
        setState({});
        try {
          const { error } = await createClient().auth.resetPasswordForEmail(
            email,
            { redirectTo: `${window.location.origin}/auth/callback` },
          );
          setState(
            error
              ? {
                  error:
                    "Unable to send a reset link right now. Please try again shortly.",
                }
              : {
                  success:
                    "If an account exists for this email, you’ll receive a reset link. Open it in this browser.",
                },
          );
        } catch {
          setState({
            error: "Unable to connect. Check your connection and try again.",
          });
        } finally {
          setPending(false);
        }
      }}
    >
      <label>
        Work email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@peakleads.com"
        />
      </label>
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
        {pending ? "Sending…" : "Send reset link"}
      </button>
      <Link href="/login" className="auth-link">
        Back to sign in
      </Link>
    </form>
  );
}
