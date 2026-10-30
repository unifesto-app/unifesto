"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPartnerToday } from "@/lib/api/account";
import { useWebSession } from "@/lib/auth";
import { IST } from "@/lib/site";
import { useAccount } from "../AccountShell";

/**
 * The app's Partner stats: each link an organiser made for me to share, how
 * many registrations it brought (all time and today) and the link itself.
 */
export default function PartnerPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const { partnerLinks } = useAccount();
  const [today, setToday] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    Promise.all(partnerLinks.map((l) => getPartnerToday(token, l.id).then((n) => [l.id, n] as const, () => null))).then(
      (rows) => live && setToday(Object.fromEntries(rows.filter((r) => r !== null))),
    );
    return () => {
      live = false;
    };
  }, [token, partnerLinks]);

  const copy = (id: string, url: string) =>
    navigator.clipboard.writeText(url).then(
      () => setCopied(id),
      () => undefined,
    );

  if (!partnerLinks.length) return <p className="text-muted-foreground">No partner links yet. Organisers add them from their event&apos;s Tracking page.</p>;

  return (
    <ul className="divide-y divide-border">
      {partnerLinks.map((l) => (
        <li key={l.id} className="space-y-2 py-4">
          <div>
            <Link href={`/event/${l.event.slug}`} className="font-semibold text-foreground hover:underline">
              {l.event.title}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[
                l.name,
                l.event.space?.name,
                new Date(l.event.startDateTime).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-foreground">{l.registrations}</strong> registrations
            {today[l.id] !== undefined && (
              <>
                {" · "}
                <strong className="font-semibold text-foreground">{today[l.id]}</strong> today
              </>
            )}
          </p>
          <p className="flex items-center gap-3 text-sm">
            <code className="min-w-0 truncate rounded-xl bg-muted px-3 py-1.5 text-xs text-foreground/80">{l.trackingUrl}</code>
            <button type="button" onClick={() => copy(l.id, l.trackingUrl)} className="shrink-0 font-medium text-primary hover:underline">
              {copied === l.id ? "Copied" : "Copy"}
            </button>
          </p>
        </li>
      ))}
    </ul>
  );
}
