"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ApiError, myTickets, resendTicket, sendEmailCode, verifyEmailCode, type MyTicket } from "@/lib/api/registration";
import { clearSession, getSession, setSession, type WebSession } from "@/lib/auth";

const FIELD =
  "w-full rounded-3xl bg-canvas px-4 py-3 text-sm text-paper placeholder:text-paper/55 focus:outline-none focus:ring-1 focus:ring-primary/50";
const noopSubscribe = () => () => {};

/**
 * K15: a web-only attendee's way back to their ticket. Signs in with the same
 * email code as registration and lists the app's My tickets, with the QR the
 * door scans (the app renders `qrCode || id` too).
 */
export default function TicketsClient() {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [sessionOverride, setSessionState] = useState<WebSession | null | undefined>(undefined);
  const session = sessionOverride !== undefined ? sessionOverride : hydrated ? getSession() : null;
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signOut = () => {
    clearSession();
    setSessionState(null);
    setTickets(null);
  };

  useEffect(() => {
    if (!session) return;
    let live = true;
    myTickets(session.token)
      .then((t) => live && setTickets(t))
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) signOut();
        else setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [session?.token]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // A fresh email has no account yet, so no tickets either.
    if (!res.accessToken) throw new Error("There's no Unifesto account with this email yet.");
    const s: WebSession = { token: res.accessToken, email: email.trim(), fullName: res.user?.fullName || null };
    setSession(s);
    setSessionState(s);
  });

  let body;
  if (!hydrated) body = null;
  else if (!session) {
    body = codeSent ? (
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
          {busy ? "Verifying…" : "Show My tickets"}
        </button>
        <button type="button" onClick={() => setCodeSent(false)} className="text-sm text-paper/65 hover:text-paper">
          Change email
        </button>
      </form>
    ) : (
      <form onSubmit={sendCode} className="space-y-4">
        <p className="text-paper/75">Enter the email you registered with. We send you a code to confirm it&apos;s you.</p>
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
  } else {
    body = (
      <div className="space-y-6">
        <p className="text-sm text-paper/65">
          Signed in as <strong className="text-paper">{session.email}</strong>.{" "}
          <button type="button" onClick={signOut} className="underline hover:text-paper">
            Sign out
          </button>
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!tickets && !error && <p className="text-paper/65">Loading My tickets…</p>}
        {tickets?.length === 0 && (
          <p className="text-paper/75">
            No upcoming tickets on this account.{" "}
            <Link href="/events" className="underline">
              Find an event
            </Link>
          </p>
        )}
        {tickets?.map((t) => <TicketCard key={t.id} ticket={t} token={session.token} />)}
      </div>
    );
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="px-5 pb-24 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight text-paper">My tickets</h1>
          <div className="mt-8 rounded-3xl bg-night-2 p-6 sm:p-8">{body}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function TicketCard({ ticket: t, token }: { ticket: MyTicket; token: string }) {
  const [svg, setSvg] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const qrValue = t.qrCode || t.id;

  useEffect(() => {
    QRCode.toString(qrValue, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(setSvg, () => setSvg(""));
  }, [qrValue]);

  const resend = async () => {
    setSending(true);
    setMsg("");
    try {
      const r = await resendTicket(t.id, token);
      setMsg(r.email ? `Sent to ${r.email}.` : "Sent.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't send it. Try again later.");
    } finally {
      setSending(false);
    }
  };

  const when = new Date(t.event.startDateTime).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const where = t.event.venueName || t.event.city || (t.event.type === "ONLINE" ? "Online" : "Venue TBA");

  return (
    <article className="rounded-2xl border border-paper/10 p-5">
      <Link href={`/event/${t.event.slug}`} className="font-semibold text-paper hover:underline">
        {t.event.title}
      </Link>
      <p className="mt-1 text-sm text-paper/65">
        {when} · {where}
      </p>
      {t.ticketType?.name && <p className="mt-1 text-sm text-paper/65">{t.ticketType.name}</p>}
      <div className="mx-auto mt-4 w-48 overflow-hidden rounded-xl bg-white p-2" aria-label="Ticket QR code" role="img">
        {/* The SVG comes from the qrcode encoder, never from the API. */}
        {svg && <div dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
      <p className="mt-2 text-center font-mono text-xs text-paper/55">{t.id.slice(0, 8).toUpperCase()}</p>
      <div className="mt-4 text-center">
        <button type="button" disabled={sending} onClick={resend} className="text-sm text-paper/75 underline hover:text-paper">
          {sending ? "Sending…" : "Email me this ticket"}
        </button>
        {msg && <p className="mt-1 text-xs text-paper/65">{msg}</p>}
      </div>
    </article>
  );
}
