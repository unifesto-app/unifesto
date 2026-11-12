"use client";

import { useEffect, useState } from "react";
import { X } from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import { PLAN_LABEL, type OrgPlan } from "@/console/lib/api/subscriptions-api";
import { PLANS, planFee } from "@/lib/site";

/**
 * Z2: tell organisers the platform fee applies from 3 Nov 2026 (the Terms v2
 * date), and that every Space moved to General (replaces A10's 2 Nov notice).
 * Shown to the people who run a space's money (Space Admins, Curators) for two
 * weeks; dismissing it hides it on this browser.
 */
const GO_LIVE_LABEL = "3 November 2026";
const SHOW_UNTIL = new Date("2026-11-17T00:00:00+05:30");
// New key: the 31 Oct notice had the wrong date, so it shows again for everyone.
const DISMISS_KEY = "fee-notice-2026-11-03";

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

  const plan = billing && PLANS.find((p) => p.id === billing.plan.toLowerCase());
  if (
    dismissed ||
    new Date() >= SHOW_UNTIL ||
    !billing ||
    !plan ||
    plan.feeText ||
    !(can("space:manage-money") || can("event:manage-money"))
  ) {
    return null;
  }

  const keep = (500 * (1 - plan.fee / 100)).toFixed(2).replace(/\.00$/, "");
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
            Since {GO_LIVE_LABEL}, paid tickets on your {PLAN_LABEL[billing.plan as OrgPlan]} plan carry a{" "}
            {planFee(plan)} platform fee.
          </span>{" "}
          On a ₹500 ticket you get ₹{keep}. There is no monthly fee on any plan, sales before then are not affected,
          and free events stay free. Every Space now starts on General; write to us to move up.{" "}
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
