import { ForgotPasswordForm } from "@/components/auth-form";
export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <>
      <span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>Reset your password.</h1>
      <p className="intro">We’ll send a secure link to your work email.</p>
      {(await searchParams).error && (
        <p role="alert" className="form-error">
          This reset link is invalid or expired. Request a new one below.
        </p>
      )}
      <ForgotPasswordForm />
    </>
  );
}
