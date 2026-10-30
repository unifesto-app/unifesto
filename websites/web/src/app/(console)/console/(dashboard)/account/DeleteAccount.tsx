"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelDeletion, requestDeletion } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { Button } from "@/console/components/ui/button";
import { useAccount } from "./AccountShell";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * K19: self-serve account deletion, as in the app: a request starts the
 * 30-day grace period (cancel any time before), and the API refuses while
 * something blocks closing (a Space I own, a ticket for an event that hasn't
 * ended) with a message saying which. Sits at the foot of Security, and on
 * /console/account/delete for the links that point there.
 */
export default function DeleteAccount() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { me, setMe } = useAccount();
  const due = me.deletionScheduledFor;
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = (fn: () => Promise<{ deletionScheduledFor: string | null }>) => async () => {
    setBusy(true);
    setError("");
    try {
      setMe({ ...me, deletionScheduledFor: (await fn()).deletionScheduledFor });
      setSure(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (due)
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          Your account closes on <strong className="font-semibold">{day(due)}</strong>. Until then you can still sign in, and
          you can cancel.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={busy} onClick={act(() => cancelDeletion(token))}>
          {busy ? "Cancelling…" : "Keep my account"}
        </Button>
      </div>
    );

  return (
    <div className="space-y-4 text-sm">
      <p className="text-foreground">
        Nothing is removed straight away. Your account closes <strong className="font-semibold">30 days</strong> after you
        ask, and you can cancel before then.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground marker:text-border-strong">
        <li>If you created a Space, transfer it to another member or archive it first.</li>
        <li>A ticket for an event that hasn&apos;t ended has to be cancelled first (or have a refund request in review).</li>
      </ul>
      <p className="text-muted-foreground">
        What is deleted and what the law makes us keep:{" "}
        <Link href="/delete-account#deleted" className="text-foreground underline underline-offset-4">
          Delete your account
        </Link>
        .
      </p>
      <label className="flex cursor-pointer items-start gap-3 text-foreground">
        <input
          type="checkbox"
          checked={sure}
          onChange={(e) => setSure(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--destructive))]"
        />
        <span>I understand my account and its personal data are erased after 30 days.</span>
      </label>
      {error && <p className="text-destructive">{error}</p>}
      <Button type="button" variant="destructive" disabled={!sure || busy} onClick={act(() => requestDeletion(token))}>
        {busy ? "Sending…" : "Delete my account"}
      </Button>
    </div>
  );
}
