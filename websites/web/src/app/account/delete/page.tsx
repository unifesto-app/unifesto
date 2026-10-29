"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelDeletion, requestDeletion } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { useAccount } from "../AccountShell";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * K19: self-serve account deletion, as in the app: a request starts the
 * 30-day grace period (cancel any time before), and the API refuses while
 * something blocks closing (a Space I own, a ticket for an event that hasn't
 * ended) with a message saying which.
 */
export default function DeleteAccountPage() {
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
        <p className="text-paper/85">
          Your account closes on <strong className="text-paper">{day(due)}</strong>. Until then you can still sign in, and
          you can cancel.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="button" disabled={busy} onClick={act(() => cancelDeletion(token))} className="btn btn-primary">
          {busy ? "Cancelling…" : "Keep my account"}
        </button>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-paper/85">
        Nothing is removed straight away. Your account closes <strong className="text-paper">30 days</strong> after you
        ask, and you can cancel before then.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-paper/75">
        <li>If you created a Space, transfer it to another member or archive it first.</li>
        <li>A ticket for an event that hasn&apos;t ended has to be cancelled first (or have a refund request in review).</li>
      </ul>
      <p className="text-sm text-paper/65">
        What is deleted and what the law makes us keep:{" "}
        <Link href="/delete-account#deleted" className="underline">
          Delete your account
        </Link>
        .
      </p>
      <label className="flex items-start gap-3 text-sm text-paper/85">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
        <span>I understand my account and its personal data are erased after 30 days.</span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" disabled={!sure || busy} onClick={act(() => requestDeletion(token))} className="btn btn-primary disabled:opacity-40">
        {busy ? "Sending…" : "Delete my account"}
      </button>
    </div>
  );
}
