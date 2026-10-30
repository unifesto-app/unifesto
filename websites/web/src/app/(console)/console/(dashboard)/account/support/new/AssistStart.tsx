"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { startAssist } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";

const FIELD =
  "w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20";

/** The app's Assist start: one question; Assist answers in the case it opens. */
export default function AssistStart({ registrationId, eventId }: { registrationId?: string; eventId?: string }) {
  const router = useRouter();
  const { session } = useWebSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const c = await startAssist(session.token, { message: message.trim(), ...(registrationId ? { registrationId } : eventId ? { eventId } : {}) });
      router.push(`/console/account/support/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the request.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-4">
      <Link href="/console/account/support" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
        ← My requests
      </Link>
      <h2 className="font-display text-xl text-foreground">How can we help?</h2>
      {registrationId && <p className="text-sm text-muted-foreground">About one of my tickets.</p>}
      <textarea
        required
        autoFocus
        rows={4}
        maxLength={4000}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your question"
        aria-label="My question"
        className={`${FIELD} resize-y`}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Assist is an AI helper and can get things wrong. To answer, it reads my bookings and refunds on Unifesto, and this chat is saved as a
        support request. A person can take over anytime.{" "}
        <Link href="/privacy-notice" className="underline">
          Privacy notice
        </Link>
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy || !message.trim()} className="btn btn-primary disabled:opacity-40">
        {busy ? "Asking Assist…" : "Ask"}
      </button>
    </form>
  );
}
