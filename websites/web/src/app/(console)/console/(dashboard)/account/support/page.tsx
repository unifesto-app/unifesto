"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KIND_LABEL, STATUS_LABEL, listMyCases, type SupportCase } from "@/lib/api/support";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { Button } from "@/console/components/ui/button";
import { cn } from "@/console/lib/utils/cn";

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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <p className="max-w-xl text-sm text-muted-foreground">
          Ask Unifesto about a booking, a refund, an event or a space I run. Assist, our AI helper, answers first and hands it to a
          person when it can&apos;t.
        </p>
        <Button asChild size="sm">
          <Link href="/console/account/support/new">Ask for help</Link>
        </Button>
      </div>
      {!cases ? (
        error ? <p className="pt-6 text-sm text-destructive">{error}</p> : <p className="pt-6 text-sm text-muted-foreground">Loading my requests…</p>
      ) : !cases.length ? (
        <p className="pt-6 text-sm text-muted-foreground">No requests yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/console/account/support/${c.id}`}
                className="flex items-start gap-3 rounded-lg px-3 py-4 transition-colors duration-150 hover:bg-muted"
              >
                {/* A new reply: the sidebar's star; otherwise nothing. */}
                <span
                  aria-hidden="true"
                  className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", c.unread ? "bg-foreground shadow-[0_0_6px_rgb(var(--bloom)/0.9)]" : "bg-transparent")}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", c.unread ? "font-semibold text-foreground" : "text-foreground/80")}>
                    {c.subject}
                    {c.unread && <span className="sr-only"> (new reply)</span>}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
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
                <span className={cn("shrink-0 pt-0.5 text-xs font-medium", c.status === "RESOLVED" || c.status === "CLOSED" ? "text-muted-foreground" : "text-foreground")}>
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
