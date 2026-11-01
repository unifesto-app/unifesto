"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignIn from "@/components/SignIn";
import { FIELD, Question } from "@/components/FormQuestion";
import { openAppOrStore, storeUrlFor } from "@/lib/appLinks";
import { clearSession, setSession, useWebSession } from "@/lib/auth";
import {
  acceptLegal,
  ApiError,
  claimSeat,
  getClaimInfo,
  getEventFields,
  pendingLegal,
  saveName,
  visibleFieldIds,
  type ClaimInfo,
  type FormField,
} from "@/lib/api/registration";

/**
 * Group-seat claim (Q16). The link is the invite: whoever opens it signs in any
 * way (Google, the app, an email code, or a new account) and claims the seat
 * here, no app needed. The lead is emailed who claimed it and can give the seat
 * to someone else from Manage group.
 */
export default function ClaimPage() {
  const token = String(useParams().token ?? "");
  const deepLink = `unifesto://claim/${token}`;
  const { session, ready, pending } = useWebSession();
  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fullName, setFullName] = useState("");
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authToken = session?.token;
  useEffect(() => {
    if (!authToken) return;
    let live = true;
    getClaimInfo(token, authToken)
      .then(async (i) => {
        // The member's own questions for this ticket; the lead answered the team's.
        const all = await getEventFields(i.event.id).catch(() => [] as FormField[]);
        if (!live) return;
        setFields(
          all.filter((f) => !f.perGroup && (!f.ticketTypeId || f.ticketTypeId === i.ticketTypeId)).sort((a, b) => a.order - b.order),
        );
        setError("");
        setInfo(i);
      })
      .catch((e) => {
        if (!live) return;
        if (e instanceof ApiError && e.status === 401) return void clearSession();
        setError(e instanceof Error ? e.message : "This link doesn't work.");
      });
    return () => {
      live = false;
    };
  }, [token, authToken]);

  const visible = visibleFieldIds(fields, answers);
  const shown = fields.filter((f) => visible.has(f.id));

  const claim = async (e: FormEvent) => {
    e.preventDefault();
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const name = session.fullName || fullName.trim();
      if (!session.fullName) {
        await saveName(name, session.token);
        setSession({ ...session, fullName: name });
      }
      // Continuing past the Terms line accepts them, as registering does (K12).
      for (const d of await pendingLegal(session.token)) await acceptLegal(d.slug, d.version, session.token);
      await claimSeat(token, session.token, { name, customFields: Object.fromEntries(shown.map((f) => [f.id, answers[f.id]])) });
      setClaimed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const openApp = (
    <button type="button" onClick={() => openAppOrStore(deepLink)} className="btn btn-secondary mt-3 w-full">
      Open in the Unifesto app
    </button>
  );
  const notYou = session && (
    <p className="mt-5 text-sm text-paper/65">
      Signed in as <strong className="text-paper">{session.email}</strong>.{" "}
      <button type="button" onClick={() => clearSession()} className="underline hover:text-paper">
        Not you?
      </button>
    </p>
  );

  let title = "You've been invited";
  let body: ReactNode = null;
  if (!ready) body = null;
  else if (!session) {
    body = (
      <>
        <p className="mb-6 text-paper/70">Someone saved you a seat in their team. Sign in any way to claim it.</p>
        <SignIn
          next={`/claim/${token}`}
          pending={pending}
          newAccounts
          intro="Or use your email. New to Unifesto? We make your account as you go."
          submitLabel="Continue"
        />
        {openApp}
      </>
    );
  } else if (claimed) {
    title = "Your seat is yours";
    body = (
      <>
        <p className="text-paper/70">
          You&apos;re going to {info?.event.title}. Your ticket and QR code are in your email, and in My tickets in the
          Unifesto app.
        </p>
        <button type="button" onClick={() => openAppOrStore("unifesto://tickets")} className="btn btn-lg btn-primary mt-8 w-full">
          Open My tickets in the app
        </button>
        <a href={storeUrlFor()} className="link-draw mt-5 inline-block text-sm text-paper/65">
          No app yet? Get it free
        </a>
      </>
    );
  } else if (error && !info) {
    title = "This seat can't be claimed";
    body = (
      <>
        <p className="text-paper/70">{error.replace(/\.?$/, ".")} Ask your team lead to send the seat again.</p>
        {notYou}
      </>
    );
  } else if (!info) body = <p className="text-paper/70">One moment…</p>;
  else if (info.alreadyRegistered) {
    title = "You're already going";
    body = (
      <>
        <p className="text-paper/70">
          This account already has a ticket for {info.event.title}, so it can&apos;t take this seat too. Let your team lead
          know, so they can give it to someone else.
        </p>
        {notYou}
      </>
    );
  } else if (fields.some((f) => f.type === "FILE")) {
    body = (
      <>
        <p className="text-paper/70">This seat asks for a file upload, which works in the Unifesto app.</p>
        {openApp}
        {notYou}
      </>
    );
  } else {
    body = (
      <form onSubmit={claim} className="space-y-4">
        <p className="text-paper/70">
          A seat in a team going to <strong className="text-paper">{info.event.title}</strong>.
        </p>
        {!session.fullName && (
          <input
            required
            maxLength={255}
            autoComplete="name"
            aria-label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Full name"
            className={FIELD}
          />
        )}
        {shown.map((f) => (
          <Question key={f.id} field={f} value={answers[f.id]} onChange={(v) => setAnswers((a) => ({ ...a, [f.id]: v }))} />
        ))}
        <p className="text-sm text-paper/65">
          By continuing you agree to the{" "}
          <Link href="/terms" target="_blank" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-lg btn-primary w-full">
          {busy ? "Claiming…" : "Claim my seat"}
        </button>
        {notYou}
      </form>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex min-h-[80vh] items-center justify-center bg-canvas px-5 pb-20 pt-32">
        <div className="animate-pop-in w-full max-w-md rounded-3xl bg-night-2 p-8 sm:p-10">
          <h1 className="mb-4 font-display text-3xl font-bold text-paper" style={{ letterSpacing: "-0.03em" }}>
            {title}
          </h1>
          {body}
        </div>
      </main>
      <Footer />
    </>
  );
}
