"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { startAssist } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";

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
      router.push(`/account/support/${c.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the request.");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-4">
      <Link href="/account/support" className="text-sm text-paper/65 hover:text-paper hover:underline">
        ← My requests
      </Link>
      <h2 className="font-display text-xl text-paper">How can we help?</h2>
      {registrationId && <p className="text-sm text-paper/70">About one of my tickets.</p>}
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
      <p className="text-xs leading-relaxed text-paper/55">
        Assist is an AI helper and can get things wrong. To answer, it reads my bookings and refunds on Unifesto, and this chat is saved as a
        support request. A person can take over anytime.{" "}
        <Link href="/privacy-notice" className="underline">
          Privacy notice
        </Link>
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !message.trim()} className="btn btn-primary disabled:opacity-40">
        {busy ? "Asking Assist…" : "Ask"}
      </button>
    </form>
  );
}
