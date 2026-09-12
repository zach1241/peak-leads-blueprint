import { AuthForm } from "@/components/auth-form";
import { requireUser } from "@/lib/auth";
export default async function ResetPassword() {
  await requireUser();
  return (
    <>
      <span className="eyebrow">ACCOUNT SECURITY</span>
      <h1>Choose a new password.</h1>
      <p className="intro">
        Set a strong password to secure your workspace access.
      </p>
      <AuthForm mode="reset" />
    </>
  );
}
