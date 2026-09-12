import { AuthForm } from "@/components/auth-form";
import { safeDestination } from "@/lib/navigation";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <>
      <span className="eyebrow">YOUR WORKSPACE</span>
      <h1>Welcome back.</h1>
      <p className="intro">Sign in to keep your team and client work moving.</p>
      <AuthForm
        mode="login"
        next={safeDestination((await searchParams).next)}
      />
      <p className="auth-note">
        Access is managed by your Peak Leads administrator.
      </p>
    </>
  );
}
