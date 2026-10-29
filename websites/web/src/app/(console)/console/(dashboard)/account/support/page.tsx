"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIND_LABEL, STATUS_LABEL, listMyCases, type SupportCase } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";

/** The app's My help: every request I've raised, newest first, with what's new since I last looked. */
export default function SupportPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [cases, setCases] = useState<SupportCase[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) listMyCases(token).then(setCases, (e) => setError(e.message));
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-paper/70">Ask about a booking, a refund or an event. Assist answers first and hands it to a person when it can&apos;t.</p>
        <Link href="/console/account/support/new" className="btn btn-sm btn-primary">
          Ask for help
        </Link>
      </div>
      {!cases ? (
        error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading my requests…</p>
      ) : !cases.length ? (
        <p className="text-paper/75">No requests yet.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {cases.map((c) => (
            <li key={c.id}>
              <Link href={`/console/account/support/${c.id}`} className="group flex items-start gap-3 py-4">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${c.unread ? "bg-primary" : "bg-transparent"}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate group-hover:underline ${c.unread ? "font-semibold text-paper" : "text-paper/85"}`}>
                    {c.subject}
                    {c.unread && <span className="sr-only"> (new reply)</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-paper/60">
                    {[
                      `#${c.ticketNumber}`,
                      KIND_LABEL[c.kind] ?? c.kind,
                      c.space?.name,
                      new Date(c.lastMessageAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className={`shrink-0 text-xs font-medium ${c.status === "RESOLVED" || c.status === "CLOSED" ? "text-paper/55" : "text-primary"}`}>
                  {STATUS_LABEL[c.status] ?? c.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
