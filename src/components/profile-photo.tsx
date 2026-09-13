"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Avatar } from "./avatar";

const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];
export function ProfilePhoto({ userId, name, url }: { userId: string; name: string; url: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string>();
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get("photo");
    setError(""); setSuccess("");
    if (!(file instanceof File) || !file.size) { setError("Choose a profile photo."); return; }
    if (!acceptedTypes.includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Choose a PNG, JPG or WEBP image up to 2 MB."); return;
    }
    setPending(true);
    try {
      const db = createClient();
      const { data, error: authError } = await db.auth.getUser();
      if (authError || !data.user || data.user.id !== userId)
        throw new Error("Your session has changed or expired. Sign in again before uploading.");
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${data.user.id}/${crypto.randomUUID()}.${extension}`;
      const result = await db.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (result.error) throw new Error(`Photo upload failed: ${result.error.message} (code ${result.error.statusCode}). Share this message with your administrator if it continues.`);
      const avatarUrl = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const saved = await db.from("profiles").update({ avatar_url: avatarUrl }).eq("id", data.user.id).select("avatar_url").single();
      if (saved.error) throw new Error(`Photo uploaded, but saving your profile failed: ${saved.error.message} (code ${saved.error.code}).`);
      if (saved.data.avatar_url !== avatarUrl) throw new Error("Your saved photo could not be confirmed. Refresh and try again.");
      setUploadedUrl(avatarUrl);
      setSuccess("Profile photo updated.");
      form.reset();
      router.refresh();
      // Old-photo cleanup cannot undo a successful save or remove the new photo.
      try {
      // Remove only the previous photo in this user's own avatar folder.
      const prefix = db.storage.from("avatars").getPublicUrl(`${userId}/`).data.publicUrl;
      const previousUrl = uploadedUrl || url;
      if (previousUrl?.startsWith(prefix)) {
        const previous = previousUrl.slice(prefix.length);
        if (/^[0-9a-f-]{36}(\.(png|jpg|webp))?$/.test(previous)) await db.storage.from("avatars").remove([`${userId}/${previous}`]);
      }
      } catch { /* The new photo is saved; old-image cleanup is optional. */ }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to upload your photo.");
    } finally { setPending(false); }
  }
  return <form onSubmit={upload} className="profile-photo-form">
    <Avatar name={name} url={uploadedUrl || url} />
    <label>Profile photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} required aria-describedby="photo-help" /></label>
    <p id="photo-help" className="data-note">PNG, JPG or WEBP · Up to 2 MB. Profile photos use a public image URL; anyone with the link can view it.</p>
    <button className="button secondary" disabled={pending}>{pending ? "Uploading…" : "Upload photo"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p role="status">{success}</p>}
  </form>;
}
