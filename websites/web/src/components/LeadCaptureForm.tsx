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
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center gap-2 text-white">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <p className="font-semibold">{successText}</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>

      <div className="mt-4 space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
        />
        {withMessage && (
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your message"
            rows={3}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary focus:outline-none"
          />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Submitting…" : cta}
        </button>
      </div>
    </form>
  );
}
