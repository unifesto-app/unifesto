"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SignIn from "@/components/SignIn";
import { ApiError, verifyPayment } from "@/lib/api/registration";
import {
  getWaitlist,
  isOver,
  leaveWaitlist,
  loadTickets,
  payWaitlistOffer,
  type Ticket,
  type WaitlistEntry,
} from "@/lib/api/tickets";
import { clearSession, useWebSession } from "@/lib/auth";
import { CHECKOUT_JS, checkout } from "@/lib/razorpay";
import { IST } from "@/lib/site";

type Tab = "upcoming" | "waitlist" | "past" | "cancelled";
// The app's order: what's coming, what I'm queued for, then history.
const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "waitlist", label: "Waiting list" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST });
export const where = (e: { venueName: string | null; city: string | null; type?: string }) =>
  e.venueName || e.city || (e.type === "ONLINE" ? "Online" : "Venue TBA");

/** The page around My tickets and a ticket: navbar, title, card. */
export function TicketsFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="px-5 pb-24 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto max-w-xl">
          <h1 className="font-display text-[clamp(1.5rem,3vw,2.2rem)] leading-tight text-paper">{title}</h1>
          <div className="mt-8 rounded-3xl bg-night-2 p-6 sm:p-8">{children}</div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

/**
 * K15 + the app's Tickets tab: upcoming, waiting list, past and cancelled,
 * each ticket opening its own page with the QR and what I can do with it.
 */
export default function TicketsClient({ nonce }: { nonce?: string }) {
  const { session, ready, pending } = useWebSession();
  const token = session?.token ?? "";
  const [tab, setTab] = useState<Tab>("upcoming");
  const [lists, setLists] = useState<{ live: Ticket[]; cancelled: Ticket[] } | null>(null);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  const load = () =>
    Promise.all([loadTickets(token), getWaitlist(token).catch(() => [])]).then(
      ([l, w]) => {
        setLists(l);
        setWaitlist(w);
      },
      (e) => {
        if (e instanceof ApiError && e.status === 401) clearSession();
        else setError(e.message);
      },
    );
  useEffect(() => {
    if (token) void load();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async (w: WaitlistEntry) => {
    setBusy(w.registrationId);
    setError("");
    try {
      await leaveWaitlist(token, w.registrationId);
      setWaitlist((l) => l.filter((x) => x.registrationId !== w.registrationId));
      setSure(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave the waiting list.");
    } finally {
      setBusy(null);
    }
  };

  /** Pays for an offered spot; the normal verify converts the waiting-list row in place. */
  const pay = async (w: WaitlistEntry) => {
    if (!session) return;
    setBusy(w.registrationId);
    setError("");
    try {
      const order = await payWaitlistOffer(token, w.registrationId);
      const p = await checkout({
        key: order.razorpayKeyId,
        orderId: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency || "INR",
        name: "Unifesto",
        description: w.event.title,
        prefill: { name: session.fullName || "", email: session.email, contact: "" },
        color: "#3491ff",
      });
      await verifyPayment(w.event.id, token, {
        registrationId: w.registrationId,
        razorpayOrderId: p.razorpay_order_id,
        razorpayPaymentId: p.razorpay_payment_id,
        razorpaySignature: p.razorpay_signature,
      });
      setMsg(`You're in for ${w.event.title}. The ticket is under Upcoming.`);
      await load();
      setTab("upcoming");
    } catch (e) {
      // The seat stays held until the offer expires, so they can try again.
      setError(e instanceof Error ? e.message : "Payment didn't go through.");
      await getWaitlist(token).then(setWaitlist, () => undefined);
    } finally {
      setBusy(null);
    }
  };

  let body;
  if (!ready) body = null;
  else if (!session)
    body = (
      <SignIn
        next="/tickets"
        pending={pending}
        intro="Enter the email you registered with. We send you a code to confirm it's you."
        submitLabel="Show My tickets"
      />
    );
  else {
    // Upcoming until the event ends, so the pass is still up front at the door. Soonest first; history newest first.
    const live = lists?.live ?? [];
    const upcoming = live.filter((t) => !isOver(t, now)).sort((a, b) => +new Date(a.event.startDateTime) - +new Date(b.event.startDateTime));
    const past = live.filter((t) => isOver(t, now)).sort((a, b) => +new Date(b.event.startDateTime) - +new Date(a.event.startDateTime));
    const shown = tab === "upcoming" ? upcoming : tab === "past" ? past : (lists?.cancelled ?? []);
    const counts: Record<Tab, number> = { upcoming: upcoming.length, waitlist: waitlist.length, past: past.length, cancelled: lists?.cancelled.length ?? 0 };

    body = (
      <div className="space-y-6">
        <p className="text-sm text-paper/65">
          Signed in as <strong className="text-paper">{session.email}</strong>.{" "}
          <Link href="/account" className="underline hover:text-paper">
            My account
          </Link>
          {" · "}
          <button type="button" onClick={clearSession} className="underline hover:text-paper">
            Sign out
          </button>
        </p>
        <div role="tablist" aria-label="My tickets" className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors duration-150 ${
                tab === t.key ? "bg-primary text-ink" : "bg-canvas text-paper/80 hover:text-paper"
              }`}
            >
              {t.label}
              {lists && counts[t.key] > 0 && <span className="ml-1.5 opacity-70">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        {msg && <p className="text-sm text-paper/85">{msg}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!lists && !error && <p className="text-paper/65">Loading My tickets…</p>}

        {lists && tab !== "waitlist" && (
          <>
            {!shown.length && (
              <p className="text-paper/75">
                {tab === "upcoming" ? (
                  <>
                    Nothing coming up.{" "}
                    <Link href="/events" className="underline">
                      Find an event
                    </Link>
                  </>
                ) : tab === "past" ? (
                  "Events I've been to show up here."
                ) : (
                  "No cancelled tickets."
                )}
              </p>
            )}
            <ul className="divide-y divide-white/[0.06]">
              {shown.map((t) => (
                <li key={`${t.id}${t.isGroupMember ? "-seat" : ""}`}>
                  <Link href={`/tickets/${t.id}`} className="group block py-4">
                    <p className="font-semibold text-paper group-hover:underline">{t.event.title}</p>
                    <p className="mt-1 text-sm text-paper/65">
                      {when(t.event.startDateTime)} · {where(t.event)}
                    </p>
                    <p className="mt-1 text-xs text-paper/55">
                      {[t.ticketType?.name, t.isGroupMember ? `Seat in ${t.leadName || "a group"}'s booking` : null].filter(Boolean).join(" · ")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {lists && tab === "waitlist" && (
          <>
            {!waitlist.length && <p className="text-paper/75">I&apos;m not waiting for any spots.</p>}
            <ul className="divide-y divide-white/[0.06]">
              {waitlist.map((w) => {
                const offered = w.waitlistStatus === "OFFERED" && w.offer;
                return (
                  <li key={w.registrationId} className="space-y-2 py-4">
                    <Link href={`/event/${w.event.slug}`} className="font-semibold text-paper hover:underline">
                      {w.event.title}
                    </Link>
                    <p className="text-sm text-paper/65">
                      {when(w.event.startDateTime)} · {where(w.event)}
                      {w.ticketType?.name && <> · {w.ticketType.name}</>}
                    </p>
                    {offered ? (
                      <p className="text-sm font-medium text-primary">
                        A spot opened for me: ₹{w.offer!.amountDue.toLocaleString("en-IN")} to confirm
                        {w.offer!.expiresAt && <> by {when(w.offer!.expiresAt)}</>}.
                      </p>
                    ) : (
                      w.position != null && <p className="text-sm text-paper/75">Number {w.position} in the queue.</p>
                    )}
                    <div className="flex flex-wrap gap-3 pt-1">
                      {offered && w.offer!.needsPayment && (
                        <button type="button" disabled={!!busy} onClick={() => pay(w)} className="btn btn-sm btn-primary">
                          {busy === w.registrationId ? "Opening payment…" : "Pay and confirm"}
                        </button>
                      )}
                      {sure === w.registrationId ? (
                        <>
                          <button type="button" disabled={!!busy} onClick={() => leave(w)} className="btn btn-sm btn-secondary">
                            {offered ? "Yes, turn it down" : "Yes, leave"}
                          </button>
                          <button type="button" onClick={() => setSure(null)} className="text-sm text-paper/70 hover:underline">
                            Stay
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setSure(w.registrationId)} className="text-sm text-paper/70 hover:text-paper hover:underline">
                          {offered ? "Turn down" : "Leave the waiting list"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <TicketsFrame title="My tickets">
      {body}
      {waitlist.some((w) => w.offer?.needsPayment) && <Script src={CHECKOUT_JS} strategy="afterInteractive" nonce={nonce} />}
    </TicketsFrame>
  );
}
