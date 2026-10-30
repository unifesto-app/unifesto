"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EventCard from "@/components/EventCard";
import { getSavedEvents, unsaveEvent } from "@/lib/api/account";
import type { Event } from "@/lib/api/events";
import { useWebSession } from "@/lib/auth";
import { Button } from "@/console/components/ui/button";

/** K19: events I saved (in the app or here). */
export default function SavedPage() {
  const { session } = useWebSession();
  const token = session?.token ?? "";
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) getSavedEvents(token).then(setEvents, (e) => setError(e.message));
  }, [token]);

  const remove = async (id: string) => {
    setError("");
    try {
      await unsaveEvent(token, id);
      setEvents((list) => list?.filter((e) => e.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.");
    }
  };

  if (!events) return error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">Loading saved events…</p>;
  if (!events.length)
    return (
      <p className="border-t border-border pt-6 text-sm text-muted-foreground">
        Nothing saved yet. Save events in the Unifesto app and they show up here.{" "}
        <Link href="/events" className="text-foreground underline underline-offset-4">
          Find an event
        </Link>
      </p>
    );

  return (
    <div className="space-y-4 border-t border-border pt-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {events.map((e) => (
          <li key={e.id} className="space-y-2">
            <EventCard event={e} />
            <Button type="button" variant="ghost" size="sm" className="-ml-3" onClick={() => remove(e.id)}>
              Remove from saved
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
