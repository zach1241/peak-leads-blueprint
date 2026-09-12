"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Something didn’t load.</h1>
      <p>
        Please try again. If this continues, contact your workspace
        administrator.
      </p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
      <Link href="/login" className="text-link">
        Return to sign in
      </Link>
    </main>
  );
}
