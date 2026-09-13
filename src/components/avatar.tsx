"use client";
import Image from "next/image";
import { useState } from "react";

export function Avatar({ name, url }: { name: string; url?: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="avatar profile-avatar" aria-label={name}>
    {url && failedUrl !== url
      ? <Image src={url} alt="" width={40} height={40} unoptimized onError={() => setFailedUrl(url)} />
      : initials || "?"}
  </span>;
}
