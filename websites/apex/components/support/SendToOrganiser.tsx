"use client";

import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { cn } from "@/lib/utils/cn";
import { getAllEventsAdmin, type AdminEvent } from "@/lib/api/admin-events-api";
import { sendToSpace } from "@/lib/api/support-api";

/**
 * Hand a Platform help question to an event's organiser (the space desk).
 * Shown up front when AI triage says the organiser can answer it.
 */
export function SendToOrganiser({
  ticketId,
  suggested,
  reason,
  onDone,
}: {
  ticketId: string;
  /** AI triage routingHint is SPACE. */
  suggested: boolean;
  reason?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(suggested);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminEvent[]>([]);
  const [picked, setPicked] = useState<AdminEvent | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Type, then search: wait for a pause.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const { data } = await getAllEventsAdmin({ search: q, limit: 6 });
      setResults(data?.events ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const send = async () => {
    if (!picked) return;
    setSending(true);
    setError("");
    const { error } = await sendToSpace(ticketId, picked.id);
    setSending(false);
    if (error) setError(error.message || "Could not send the case.");
    else onDone();
  };

  return (
    <Card className={cn("h-fit", suggested && "border-primary/40")}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Send to organiser</CardTitle>
        <p className="text-sm text-muted-foreground">
          {suggested
            ? `AI triage thinks the organiser can answer this${reason ? `: ${reason}` : "."}`
            : "Pass this question to the space desk of an event."}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!open ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
            Pick an event
          </Button>
        ) : (
          <>
            <div className="relative">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                }}
                placeholder="Search events"
                className="pl-9"
                aria-label="Search events"
              />
            </div>
            {results.length > 0 && !picked && (
              <ul className="divide-y divide-border rounded-md border border-border">
                {results.map((ev) => (
                  <li key={ev.id}>
                    <button
                      onClick={() => setPicked(ev)}
                      className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="block truncate font-medium text-foreground">{ev.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {ev.space?.name ?? "No space"} · {new Date(ev.startDateTime).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picked && (
              <p className="text-sm text-muted-foreground">
                The {picked.space?.name ?? "event"} desk will take it from here and the requester is told.
              </p>
            )}
            {error && <ErrorNotice message={error} />}
            <Button size="sm" className="w-full" disabled={!picked || sending} onClick={send}>
              {sending ? "Sending…" : picked ? `Send to ${picked.title}` : "Send to organiser"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
