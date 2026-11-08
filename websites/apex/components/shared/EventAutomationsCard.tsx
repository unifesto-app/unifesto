"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEventAutomations, setEventAutomation, type EventAutomation } from "@/lib/api/automations-api";

/** C18: the automatic messages this event's managers can switch off, for staff to see and flip. */
export function EventAutomationsCard({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<EventAutomation[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getEventAutomations(eventId).then(({ data, error }) => {
      if (error) setError(error.message);
      else setItems(data);
    });
  }, [eventId]);

  const flip = async (a: EventAutomation) => {
    setBusy(a.key);
    setError("");
    const { data, error } = await setEventAutomation(eventId, a.key, !a.on);
    setBusy(null);
    if (error) setError(error.message);
    else setItems(data);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Automatic messages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-2 text-sm">
        {error && <p className="text-xs text-destructive">{error}</p>}
        {(items ?? []).map((a) => (
          <label key={a.key} className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={a.on}
              disabled={busy !== null}
              onChange={() => flip(a)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="text-foreground">{a.name}</span>
              <span className="block text-xs text-muted-foreground">{a.when}</span>
            </span>
          </label>
        ))}
        {items && <p className="text-xs text-muted-foreground">Unticked ones don&apos;t go out for this event.</p>}
      </CardContent>
    </Card>
  );
}
