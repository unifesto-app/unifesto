"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { QrCode } from "@unifesto/unicon/react";
import QrSignIn from "@/components/QrSignIn";
import SocialSignIn from "@/components/SocialSignIn";
import { sendEmailCode, verifyEmailCode } from "@/lib/api/registration";
import { clearSession, startSession, type PendingSignIn } from "@/lib/auth";

const FIELD =
  "w-full rounded-lg bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";

/**
 * K18/K19: sign in to an existing account on the web: Google, or the email
 * code. A new email or Google account has nothing to show here, so it gets
 * told where accounts are made (Q20). Signing in updates the shared session,
 * so the page re-renders signed in.
 */

const LINK = "text-paper underline underline-offset-4";

/** Q20: what a new email or Google account does instead of signing in. */
function NewHere() {
  return (
    <>
      To make one,{" "}
      <Link href="/events" className={LINK}>
        register for an event
      </Link>
      , or{" "}
      <Link href="/request-space" className={LINK}>
        start a space
      </Link>{" "}
      to run your own.
    </>
  );
}
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
  const [qr, setQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [noAccount, setNoAccount] = useState(false);

  const run = (fn: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNoAccount(false);
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
    if (!res.accessToken) return setNoAccount(true);
    await startSession(res, { email: email.trim(), fullName: res.user?.fullName || null });
  });

  if (pending) {
    return (
      <p className="text-paper/75">
        <strong className="text-paper">{pending.email}</strong> isn&apos;t on Unifesto yet. Sign in with the email you
        registered with instead.{" "}
        <button type="button" onClick={clearSession} className="underline hover:text-paper">
          Use my email
        </button>{" "}
        New here? <NewHere />
      </p>
    );
  }

  if (qr) return <QrSignIn onCancel={() => setQr(false)} />;

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
      {noAccount && (
        <p className="text-sm text-paper/75">
          There&apos;s no Unifesto account with this email yet. <NewHere />
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary w-full">
        {busy ? "Verifying…" : submitLabel}
      </button>
      <button
        type="button"
        onClick={() => {
          setCodeSent(false);
          setNoAccount(false);
        }}
        className="text-sm text-paper/65 hover:text-paper"
      >
        Change email
      </button>
    </form>
  ) : (
    <form onSubmit={sendCode} className="space-y-4">
      <SocialSignIn next={next} />
      {/* Scanning needs a second screen: on a phone this would be the same one. */}
      <button type="button" onClick={() => setQr(true)} className="btn btn-secondary w-full max-md:hidden">
        <QrCode className="h-4 w-4" aria-hidden="true" />
        Sign in with the app
      </button>
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
