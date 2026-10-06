/**
 * A compact dark-themed lead capture form used on public event pages ("Notify
 * me") and space pages (inquiry). Owns its own submit + success state; the
 * caller supplies the network call and the copy.
 */

"use client";

import React, { useState } from "react";
import { CheckCircle } from "lucide-react";
import type { LeadCapture } from "@/lib/api/leads";

interface LeadCaptureFormProps {
  title: string;
  description: string;
  cta: string;
  successText: string;
  /** Show a free-text message field (inquiries) vs email-only (notify me). */
  withMessage?: boolean;
  onSubmit: (body: LeadCapture) => Promise<{ ok: boolean; error?: string }>;
}

export default function LeadCaptureForm({
  title,
  description,
  cta,
  successText,
  withMessage = false,
  onSubmit,
}: LeadCaptureFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit({
      name: name || undefined,
      email: email.trim(),
      message: message || undefined,
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Something went wrong.");
  };

  if (done) {
    return (
      <div className="rounded-3xl bg-night-2 p-6">
        <div className="flex items-center gap-2 text-white">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <p className="font-semibold">{successText}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl bg-night-2 p-6">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-paper/65">{description}</p>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="w-full rounded-lg border border-white/10 bg-paper/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-paper/55 focus:border-steel focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="w-full rounded-lg border border-white/10 bg-paper/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-paper/55 focus:border-steel focus:outline-none"
        />
        </div>
        {withMessage && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message"
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-paper/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-paper/55 focus:border-steel focus:outline-none"
          />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full rounded-lg bg-primary px-6 sm:w-auto py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Submitting…" : cta}
        </button>
      </div>
    </form>
  );
}
