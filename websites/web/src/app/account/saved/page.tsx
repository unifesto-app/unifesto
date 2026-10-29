"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EventCard from "@/components/EventCard";
import { getSavedEvents, unsaveEvent } from "@/lib/api/account";
import type { Event } from "@/lib/api/events";
import { useWebSession } from "@/lib/auth";

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

  if (!events) return error ? <p className="text-sm text-red-400">{error}</p> : <p className="text-paper/65">Loading saved events…</p>;
  if (!events.length)
    return (
      <p className="text-paper/75">
        Nothing saved yet. Save events in the Unifesto app and they show up here.{" "}
        <Link href="/events" className="underline">
          Find an event
        </Link>
      </p>
    );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="grid gap-5 sm:grid-cols-2">
        {events.map((e) => (
          <li key={e.id} className="space-y-2">
            <EventCard event={e} />
            <button type="button" onClick={() => remove(e.id)} className="text-sm text-paper/65 underline hover:text-paper">
              Remove from saved
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
