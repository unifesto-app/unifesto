"use client";

import { useState } from "react";
import { Paperclip } from "@phosphor-icons/react";
import { getFormUploadUrl } from "@/lib/api/events-api";
import { formatAnswer, isFileAnswer } from "@/lib/form-questions";

/**
 * One registration answer for display. A file opens through a 5-minute
 * signed link (the backend checks the viewer may see it); everything else is
 * shown as text.
 */
export function AnswerValue({ eventId, value }: { eventId: string; value: unknown }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!isFileAnswer(value)) return <>{formatAnswer(value)}</>;

  const open = async () => {
    setBusy(true);
    setErr("");
    // Open the tab synchronously so pop-up blockers allow it, then point it
    // at the signed link.
    const tab = window.open("", "_blank");
    const { data, error } = await getFormUploadUrl(eventId, value.key);
    setBusy(false);
    if (error || !data) {
      tab?.close();
      setErr(error?.message ?? "Couldn't open the file.");
      return;
    }
    if (tab) tab.location.href = data.url;
    else window.location.href = data.url;
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60"
      >
        <Paperclip className="h-3.5 w-3.5" />
        {busy ? "Opening…" : value.name || "View file"}
      </button>
      {err && <span className="text-xs text-destructive">{err}</span>}
    </span>
  );
}
