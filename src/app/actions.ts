"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { safeDestination } from "@/lib/navigation";
export type AuthState = { error?: string; success?: string };
export async function login(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error)
    return {
      error: "Unable to sign in. Check your credentials and try again.",
    };
  revalidatePath("/", "layout");
  redirect(safeDestination(form.get("next")));
}
export async function resetPassword(
  _: AuthState,
  form: FormData,
): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 12)
    return { error: "Use at least 12 characters for your new password." };
  if (password !== form.get("confirmPassword"))
    return { error: "The passwords do not match." };
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    return {
      error: "Your reset session has expired. Request a new reset link.",
    };
  const { error } = await supabase.auth.updateUser({ password });
  if (error)
    return {
      error:
        "Unable to update your password. Use a different password or request a new link.",
    };
  revalidatePath("/", "layout");
  return {
    success:
      "Your password has been updated. You can return to your dashboard.",
  };
}
export async function logout(): Promise<AuthState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) return { error: "Sign out failed. Please try again." };
  revalidatePath("/", "layout");
  redirect("/login");
}
