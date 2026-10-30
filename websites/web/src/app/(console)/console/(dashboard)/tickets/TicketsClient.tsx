"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";
import { CaretRight } from "@unifesto/unicon/react";
import { SignInPrompt } from "@/console/components/shared/SignInPrompt";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { Button } from "@/console/components/ui/button";
import { cn } from "@/console/lib/utils/cn";
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

/**
 * A ticket as a row: its date as a stub on the left (month over day), then
 * the event, when and where, and what kind of ticket. My tickets and the
 * console home both list them this way.
 */
export function TicketRow({ ticket: t }: { ticket: Ticket }) {
  const at = new Date(t.event.startDateTime);
  const part = (o: Intl.DateTimeFormatOptions) => at.toLocaleString("en-IN", { ...o, timeZone: IST });
  return (
    <Link
      href={`/console/tickets/${t.id}`}
      className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-muted"
    >
      <span className="text-center leading-none">
        <span className="block text-[11px] font-medium text-muted-foreground">{part({ month: "short" })}</span>
        <span className="mt-1 block font-display text-xl tabular-nums text-foreground">{part({ day: "numeric" })}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{t.event.title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {[
            part({ weekday: "short", hour: "numeric", minute: "2-digit" }),
            where(t.event),
            t.ticketType?.name,
            t.isGroupMember ? `Seat in ${t.leadName || "a group"}'s booking` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <CaretRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

/**
 * The page around a ticket, its details or event feedback: the page title,
 * then the content on a hairline, full width like every console page, no card.
 */
export function TicketsFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} />
      <div className="border-t border-border pt-6">{children}</div>
    </div>
  );
}

/**
 * K15 + the app's Tickets tab: upcoming, waiting list, past and cancelled,
 * each ticket opening its own page with the QR and what I can do with it.
 */
export default function TicketsClient({ nonce }: { nonce?: string }) {
  const { session, ready } = useWebSession();
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
      <SignInPrompt />
    );
  else {
    // Upcoming until the event ends, so the pass is still up front at the door. Soonest first; history newest first.
    const live = lists?.live ?? [];
    const upcoming = live.filter((t) => !isOver(t, now)).sort((a, b) => +new Date(a.event.startDateTime) - +new Date(b.event.startDateTime));
    const past = live.filter((t) => isOver(t, now)).sort((a, b) => +new Date(b.event.startDateTime) - +new Date(a.event.startDateTime));
    const shown = tab === "upcoming" ? upcoming : tab === "past" ? past : (lists?.cancelled ?? []);
    const counts: Record<Tab, number> = { upcoming: upcoming.length, waitlist: waitlist.length, past: past.length, cancelled: lists?.cancelled.length ?? 0 };

    const empty = (text: React.ReactNode) => <p className="pt-6 text-sm text-muted-foreground">{text}</p>;

    body = (
      <div>
        {/* The console's segmented tabs (ui/tabs' look), kept as plain buttons: the panels below aren't Radix content. */}
        <div role="tablist" aria-label="My tickets" className="inline-flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-md bg-muted p-1 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all duration-150",
                tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {lists && counts[t.key] > 0 && <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[t.key]}</span>}
            </button>
          ))}
        </div>
        {msg && <p className="pt-4 text-sm text-success">{msg}</p>}
        {error && <p className="pt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 border-t border-border">
          {!lists && !error && empty("Loading My tickets…")}

          {lists &&
            tab !== "waitlist" &&
            (!shown.length ? (
              empty(
                tab === "upcoming" ? (
                  <>
                    Nothing coming up.{" "}
                    <Link href="/events" className="text-foreground underline underline-offset-4">
                      Find an event
                    </Link>
                  </>
                ) : tab === "past" ? (
                  "Events I've been to show up here."
                ) : (
                  "No cancelled tickets."
                )
              )
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((t) => (
                  <li key={`${t.id}${t.isGroupMember ? "-seat" : ""}`}>
                    <TicketRow ticket={t} />
                  </li>
                ))}
              </ul>
            ))}

          {lists &&
            tab === "waitlist" &&
            (!waitlist.length ? (
              empty("I'm not waiting for any spots.")
            ) : (
              <ul className="divide-y divide-border">
                {waitlist.map((w) => {
                  const offered = w.waitlistStatus === "OFFERED" && w.offer;
                  return (
                    <li key={w.registrationId} className="space-y-2 px-3 py-4">
                      <Link href={`/event/${w.event.slug}`} className="text-sm font-medium text-foreground hover:underline">
                        {w.event.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {when(w.event.startDateTime)} · {where(w.event)}
                        {w.ticketType?.name && <> · {w.ticketType.name}</>}
                      </p>
                      {offered ? (
                        <p className="text-sm font-medium text-foreground">
                          A spot opened for me: ₹{w.offer!.amountDue.toLocaleString("en-IN")} to confirm
                          {w.offer!.expiresAt && <> by {when(w.offer!.expiresAt)}</>}.
                        </p>
                      ) : (
                        w.position != null && <p className="text-sm tabular-nums text-muted-foreground">Number {w.position} in the queue.</p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {offered && w.offer!.needsPayment && (
                          <Button type="button" size="sm" disabled={!!busy} onClick={() => pay(w)}>
                            {busy === w.registrationId ? "Opening payment…" : "Pay and confirm"}
                          </Button>
                        )}
                        {sure === w.registrationId ? (
                          <>
                            <Button type="button" variant="destructive" size="sm" disabled={!!busy} onClick={() => leave(w)}>
                              {offered ? "Yes, turn it down" : "Yes, leave"}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setSure(null)}>
                              Stay
                            </Button>
                          </>
                        ) : (
                          <Button type="button" variant="ghost" size="sm" onClick={() => setSure(w.registrationId)}>
                            {offered ? "Turn down" : "Leave the waiting list"}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My tickets" />
      {body}
      {waitlist.some((w) => w.offer?.needsPayment) && <Script src={CHECKOUT_JS} strategy="afterInteractive" nonce={nonce} />}
    </div>
  );
}
