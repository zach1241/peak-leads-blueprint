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
    const db = createClient();
    const path = `${userId}/${crypto.randomUUID()}`;
    let uploaded = false;
    try {
      const result = await db.storage.from("avatars").upload(path, file, { contentType: file.type });
      if (result.error) throw new Error("Photo upload failed. Check that avatar storage is configured, then try again.");
      uploaded = true;
      const avatarUrl = db.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const saved = await db.from("profiles").update({ avatar_url: avatarUrl }).eq("id", userId).select("id").single();
      if (saved.error) throw new Error("Unable to save your photo. Please try again.");
      // Remove only the previous photo in this user's own avatar folder.
      const prefix = db.storage.from("avatars").getPublicUrl(`${userId}/`).data.publicUrl;
      if (url?.startsWith(prefix)) {
        const previous = url.slice(prefix.length);
        if (/^[0-9a-f-]{36}$/.test(previous)) await db.storage.from("avatars").remove([`${userId}/${previous}`]);
      }
      setSuccess("Profile photo updated.");
      form.reset();
      router.refresh();
    } catch (cause) {
      if (uploaded) await db.storage.from("avatars").remove([path]);
      setError(cause instanceof Error ? cause.message : "Unable to upload your photo.");
    } finally { setPending(false); }
  }
  return <form onSubmit={upload} className="profile-photo-form">
    <Avatar name={name} url={url} />
    <label>Profile photo<input name="photo" type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} required aria-describedby="photo-help" /></label>
    <p id="photo-help" className="data-note">PNG, JPG or WEBP · Up to 2 MB. Profile photos use a public image URL; anyone with the link can view it.</p>
    <button className="button secondary" disabled={pending}>{pending ? "Uploading…" : "Upload photo"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {success && <p role="status">{success}</p>}
  </form>;
}
