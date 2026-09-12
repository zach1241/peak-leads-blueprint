import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <span className="eyebrow">404</span>
      <h1>This page isn’t here.</h1>
      <p>Head back to your workspace to find what you need.</p>
      <Link href="/dashboard" className="button primary">
        Back to dashboard
      </Link>
    </main>
  );
}
