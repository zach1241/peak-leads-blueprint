"use client";
import Image from "next/image";
import { useRef } from "react";
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button type="button" className="resource-thumbnail" aria-label={`Enlarge ${alt}`} onClick={() => dialog.current?.showModal()}>
      <Image src={src} alt={alt} fill unoptimized sizes="(max-width: 700px) 100vw, 500px" />
    </button>
    <dialog ref={dialog} className="resource-lightbox" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <button type="button" autoFocus className="button secondary" onClick={() => dialog.current?.close()} aria-label="Close image">Close ✕</button>
      <div className="resource-full-image"><Image src={src} alt={alt} fill unoptimized sizes="95vw" /></div>
    </dialog>
  </>;
}
