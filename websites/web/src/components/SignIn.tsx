"use client";

import { useState, type FormEvent } from "react";
import SocialSignIn from "@/components/SocialSignIn";
import { sendEmailCode, verifyEmailCode } from "@/lib/api/registration";
import { clearSession, startSession, type PendingSignIn } from "@/lib/auth";

const FIELD =
  "w-full rounded-lg bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";

/**
 * K18/K19: sign in to an existing account on the web: Google, or the email
 * code. A new email or Google account has nothing to show here, so it gets
 * told so (registration is where accounts are made). Signing in updates the
 * shared session, so the page re-renders signed in.
 */
export default function SignIn({
  next,
  intro,
  submitLabel,
  pending,
}: {
  /** Where Google returns to. */
  next: string;
  intro: string;
  submitLabel: string;
  pending: PendingSignIn | null;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const sendCode = run(async () => {
    await sendEmailCode(email.trim());
    setOtp("");
    setCodeSent(true);
  });
  const verify = run(async () => {
    const res = await verifyEmailCode(email.trim(), otp.trim());
    if (!res.accessToken) throw new Error("There's no Unifesto account with this email yet.");
    await startSession(res, { email: email.trim(), fullName: res.user?.fullName || null });
  });

  if (pending) {
    return (
      <p className="text-paper/75">
        <strong className="text-paper">{pending.email}</strong> isn&apos;t on Unifesto yet. Sign in with the email you
        registered with instead.{" "}
        <button type="button" onClick={clearSession} className="underline hover:text-paper">
          Use my email
        </button>
      </p>
    );
  }

  return codeSent ? (
    <form onSubmit={verify} className="space-y-4">
      <p className="text-paper/75">
        We emailed a code to <strong className="text-paper">{email.trim()}</strong>.
      </p>
      <input
        required
        autoFocus
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Verification code"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="Verification code"
        className={FIELD}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "Verifying…" : submitLabel}
      </button>
      <button type="button" onClick={() => setCodeSent(false)} className="text-sm text-paper/65 hover:text-paper">
        Change email
      </button>
    </form>
  ) : (
    <form onSubmit={sendCode} className="space-y-4">
      <SocialSignIn next={next} />
      <p className="text-paper/75">{intro}</p>
      <input
        required
        type="email"
        autoComplete="email"
        aria-label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className={FIELD}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "Sending code…" : "Email me a code"}
      </button>
    </form>
  );
}
