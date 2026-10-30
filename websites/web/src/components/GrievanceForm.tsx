"use client";

import React, { useState } from "react";
import { CheckCircle } from "@unifesto/unicon/react";
import { sendGrievanceCode, submitGrievance } from "@/lib/api/grievance";

const field =
  "w-full rounded-lg border border-white/10 bg-paper/[0.05] px-3 py-2.5 text-sm text-white placeholder:text-paper/55 focus:border-steel focus:outline-none";
const button =
  "rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * D25: raise a grievance without signing in. Step one emails a code to the
 * address on the Unifesto account; step two sends the grievance with it.
 */
export default function GrievanceForm({ officerEmail }: { officerEmail: string }) {
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState<number | null>(null);

  const address = email.trim().toLowerCase();

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await sendGrievanceCode(address);
    setBusy(false);
    if (res.ok) setCodeSent(true);
    else setError(res.error);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await submitGrievance({ email: address, otp: otp.trim(), subject: subject.trim(), message: message.trim() });
    setBusy(false);
    if (res.ok) setCaseNumber(res.data.ticketNumber);
    else setError(res.error);
  };

  if (caseNumber) {
    return (
      <div className="not-prose rounded-3xl bg-night-2 p-6">
        <div className="flex items-center gap-2 text-white">
          <CheckCircle className="h-5 w-5 text-emerald-400" />
          <p className="font-semibold">Grievance #{caseNumber} received</p>
        </div>
        <p className="mt-2 text-sm text-paper/65">
          We acknowledge it within 24 hours and resolve it within 15 days. Follow it in the Unifesto app under My help.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={codeSent ? submit : sendCode} className="not-prose space-y-4 rounded-3xl bg-night-2 p-6">
      <label className="block text-sm text-paper/65" htmlFor="grievance-email">
        Email on your Unifesto account
      </label>
      <input
        id="grievance-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={codeSent}
        required
        autoComplete="email"
        placeholder="you@example.com"
        className={field}
      />
      {codeSent && (
        <>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            placeholder="Code from your email"
            aria-label="Code from your email"
            className={field}
          />
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            maxLength={300}
            placeholder="What is it about?"
            aria-label="Subject"
            className={field}
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            maxLength={10000}
            rows={6}
            placeholder="What happened, with links, order or payment references, and what you would like us to do"
            aria-label="Your grievance"
            className={field}
          />
        </>
      )}
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
          {/account/i.test(error) && (
            <>
              {" "}
              <a href={`mailto:${officerEmail}`} className="underline">
                {officerEmail}
              </a>
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy || !address} className={button}>
          {busy ? "Sending…" : codeSent ? "Send grievance" : "Email me a code"}
        </button>
        {codeSent && (
          <button
            type="button"
            onClick={() => {
              setCodeSent(false);
              setOtp("");
            }}
            className="text-sm text-paper/65 underline-offset-4 hover:underline"
          >
            Use another email
          </button>
        )}
      </div>
    </form>
  );
}
