"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, WebAuthnAbortService } from "@simplewebauthn/browser";
import { LockKey, QrCode } from "@unifesto/unicon/react";
import QrSignIn from "@/components/QrSignIn";
import SocialSignIn from "@/components/SocialSignIn";
import { cancelled, signInWithPasskey } from "@/lib/api/passkeys";
import { sendEmailCode, sendPhoneCode, verifyEmailCode, verifyPhoneCode } from "@/lib/api/registration";
import { clearSession, startSession, type PendingSignIn } from "@/lib/auth";

const FIELD =
  "w-full rounded-lg bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";

/**
 * K18/K19: sign in to an existing account on the web: Google, a passkey, or
 * the email code. A new email or Google account has nothing to show here, so it gets
 * told where accounts are made (Q20), unless the page takes new accounts
 * (`newAccounts`, Q16: a seat claim), where it adds a WhatsApp number the way
 * registering does. Signing in updates the shared session, so the page
 * re-renders signed in.
 */

const LINK = "text-paper underline underline-offset-4";
const noop = () => () => {};

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
  newAccounts = false,
}: {
  /** Where Google returns to. */
  next: string;
  intro: string;
  submitLabel: string;
  pending: PendingSignIn | null;
  newAccounts?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [qr, setQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [noAccount, setNoAccount] = useState(false);
  const canPasskey = useSyncExternalStore(noop, browserSupportsWebAuthn, () => false);
  // A new account's last step: its WhatsApp number (email code or Google).
  const [tempToken, setTempToken] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);
  const signUp = tempToken || (newAccounts && pending?.tempToken) || "";
  const mobileNumber = `+91${phone}`;

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
    if (!res.accessToken && newAccounts && res.tempToken) return setTempToken(res.tempToken);
    if (!res.accessToken) return setNoAccount(true);
    await startSession(res, { email: email.trim(), fullName: res.user?.fullName || null });
  });
  const sendPhone = run(async () => {
    if (!/^[0-9]{10}$/.test(phone)) throw new Error("Enter a 10 digit mobile number.");
    await sendPhoneCode(mobileNumber, signUp);
    setOtp("");
    setPhoneSent(true);
  });
  const verifyPhone = run(async () => {
    const res = await verifyPhoneCode(mobileNumber, otp.trim(), signUp);
    await startSession(res, { email: pending?.email || email.trim(), fullName: res.user?.fullName || null });
  });
  // A passkey only signs in an account that has one, so it never needs the phone step.
  const withPasskey = async (autofill: boolean) => {
    try {
      const res = await signInWithPasskey(autofill);
      // The session route fills in the account's email.
      await startSession(res, { email: "", fullName: res.user?.fullName || null });
    } catch (err) {
      if (!cancelled(err)) throw err;
    }
  };
  const passkey = run(() => withPasskey(false));

  // While the email field shows, my passkeys are offered in its suggestions too.
  const emailStep = !signUp && !pending && !qr && !codeSent;
  useEffect(() => {
    if (!emailStep) return;
    let live = true;
    void browserSupportsWebAuthnAutofill().then((ok) => {
      if (ok && live) withPasskey(true).catch((err) => setError(err instanceof Error ? err.message : "Something went wrong."));
    });
    return () => {
      live = false;
      WebAuthnAbortService.cancelCeremony();
    };
  }, [emailStep]);

  if (signUp) {
    return phoneSent ? (
      <form onSubmit={verifyPhone} className="space-y-4">
        <p className="text-paper/75">
          We sent a WhatsApp code to <strong className="text-paper">+91 {phone}</strong>.
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
        <button type="button" onClick={() => setPhoneSent(false)} className="text-sm text-paper/65 hover:text-paper">
          Change number
        </button>
      </form>
    ) : (
      <form onSubmit={sendPhone} className="space-y-4">
        <p className="text-paper/75">New to Unifesto? Add your WhatsApp number to create your account.</p>
        <div className="flex items-center rounded-lg bg-canvas">
          <span className="pl-4 text-sm text-paper/65">+91</span>
          <input
            required
            autoFocus
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            aria-label="Mobile number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Mobile number (WhatsApp)"
            className="w-full bg-transparent px-3 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Sending code…" : "Send WhatsApp code"}
        </button>
      </form>
    );
  }

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
      {canPasskey && (
        <button type="button" disabled={busy} onClick={passkey} className="btn btn-secondary w-full">
          <LockKey className="h-4 w-4" aria-hidden="true" />
          Sign in with a passkey
        </button>
      )}
      <p className="text-paper/75">{intro}</p>
      <input
        required
        type="email"
        autoComplete="username webauthn"
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
