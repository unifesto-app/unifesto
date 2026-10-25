"use client";

import { useEffect, useState } from "react";
import { X } from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";

/**
 * A10: tell organisers the plan platform fee starts on GO_LIVE. Shown to the
 * people who run a space's money (Space Admins, Curators) on SUBSCRIPTION
 * spaces only: FREE (comped) and revenue-share spaces don't change. Runs until
 * two weeks after go-live; dismissing it hides it on this browser.
 */
const GO_LIVE = new Date("2026-11-02T00:00:00+05:30");
const SHOW_UNTIL = new Date("2026-11-16T00:00:00+05:30");
const GO_LIVE_LABEL = "Monday 2 November 2026";
const DISMISS_KEY = "fee-notice-2026-11-02";

/** The announced launch rate per plan (D10). GROWTH is retired: Starter's. */
const RATE: Record<string, number> = { STARTER: 2.5, GROWTH: 2.5, PRO: 1.5, ENTERPRISE: 1 };

export function FeeNoticeBanner() {
  const { billing, can } = useSession();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const now = new Date();
  const rate = billing ? RATE[billing.plan] : undefined;
  if (
    dismissed ||
    now >= SHOW_UNTIL ||
    !billing ||
    billing.billingModel !== "SUBSCRIPTION" ||
    rate == null ||
    !(can("space:manage-money") || can("event:manage-money"))
  ) {
    return null;
  }

  const live = now >= GO_LIVE;
  const keep = (500 * (1 - rate / 100)).toFixed(2);
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Private mode: it just shows again next visit.
    }
  };

  return (
    <div className="border-b border-border bg-muted/60 px-4 py-3 text-sm sm:px-6">
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <p className="flex-1 text-foreground">
          <span className="font-medium">
            {live ? `Since ${GO_LIVE_LABEL}` : `From ${GO_LIVE_LABEL}`}, paid tickets on your{" "}
            {billing.plan === "GROWTH" ? "Starter" : billing.plan.charAt(0) + billing.plan.slice(1).toLowerCase()} plan
            carry a {rate}% platform fee.
          </span>{" "}
          On a ₹500 ticket you get ₹{keep}. Sales before then are not affected, and free events stay free. You can
          include the buyer&apos;s 5% processing fee in your price from each event&apos;s Tickets page.{" "}
          <a href="https://unifesto.app/pricing" target="_blank" rel="noreferrer" className="underline">
            See pricing
          </a>
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
