"use client";

import { openAppOrStore, useAppHref } from "@/lib/appLinks";

/** Registering and joining happen in the app (the room has no link to share). */
export default function OpenSessionButton({ slug, label }: { slug: string; label: string }) {
  const scheme = `unifesto://session/${slug}`;
  const href = useAppHref(scheme);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openAppOrStore(scheme);
      }}
      className="btn btn-primary shrink-0"
    >
      {label}
    </a>
  );
}
