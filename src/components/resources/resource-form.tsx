"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { saveResource } from "@/app/resource-actions";
import { ImageViewer } from "./image-viewer";
const types = ["image/png", "image/jpeg", "image/webp"];
type Value = { id: string; title: string; description: string; image_path: string | null; resource_url?: string; resource_type?: string };
export function ResourceForm({ kind, organizationId, value, imageUrl }: { kind: "sops" | "help"; organizationId: string; value?: Value; imageUrl?: string | null }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function choose(file: File) {
    if (!types.includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size) { setError("Choose a PNG, JPG or WEBP image up to 5 MB."); return; }
    setError(""); setFile(file); setPreview(URL.createObjectURL(file)); setRemoved(false);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      let imagePath = removed ? "" : value?.image_path || "";
      if (file) {
        const db = createClient();
        const { data, error } = await db.auth.getUser();
        if (error || !data.user) throw new Error("Sign in again to upload an image.");
        const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
        imagePath = `${organizationId}/${kind}/${data.user.id}/${crypto.randomUUID()}.${extension}`;
        const result = await db.storage.from("workspace-images").upload(imagePath, file, { contentType: file.type });
        if (result.error) throw new Error(`Image upload failed: ${result.error.message}`);
      }
      form.set("image_path", imagePath);
      const result = await saveResource(kind, form);
      if (result.error) throw new Error(result.error);
      router.push(kind === "sops" ? "/sops" : `/help-requests/${result.id}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save. Please try again."); }
    finally { setPending(false); }
  }
  const shownImage = file ? preview : !removed ? imageUrl : null;
  return <form onSubmit={submit} className="work-form" onPaste={event => {
    if (kind !== "help" || pending || event.clipboardData.getData("text/plain")) return;
    const item = Array.from(event.clipboardData.items).find(item => item.kind === "file" && item.type.startsWith("image/"));
    const image = item?.getAsFile(); if (image) { event.preventDefault(); choose(image); }
  }}>
    <fieldset disabled={pending}>
      <input type="hidden" name="id" value={value?.id || ""} />
      <label>Title<input name="title" autoFocus={!value} defaultValue={value?.title} required maxLength={160} /></label>
      <label>{kind === "sops" ? "Short description" : "What do you need help with?"}<textarea name="description" defaultValue={value?.description} required={kind === "help"} maxLength={kind === "sops" ? 2000 : 10000} rows={4} /></label>
      {kind === "sops" && <><label>Resource link<input name="resource_url" defaultValue={value?.resource_url} required maxLength={2048} placeholder="https://… or /documents/…" /></label>
        <label>Resource type<select name="resource_type" defaultValue={value?.resource_type || "other"}><option value="loom">Loom</option><option value="youtube">YouTube</option><option value="document">Document</option><option value="other">Website / Other</option></select></label></>}
      <label>{kind === "sops" ? "Optional image" : "Optional screenshot"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const chosen = event.target.files?.[0]; if (chosen) choose(chosen); event.target.value = ""; }} /></label>
      <p className="data-note">PNG, JPG or WEBP · Up to 5 MB.{kind === "help" && " Paste a screenshot here with Ctrl+V (⌘V on Mac). Text paste works normally."}</p>
      {shownImage && <ImageViewer src={shownImage} alt="Attachment preview" />}
      {(file || (!removed && value?.image_path)) && <button type="button" className="button secondary" onClick={() => { setFile(undefined); setPreview(undefined); setRemoved(true); }}>Remove image</button>}
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Saving…" : kind === "sops" ? "Save SOP" : "Save help request"}</button>
  </form>;
}
