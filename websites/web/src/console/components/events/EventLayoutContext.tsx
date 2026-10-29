"use client";

import { createContext, useContext } from "react";
import type { Event } from "@/console/lib/api/events-api";

/**
 * The event the `[eventId]` layout already loaded, so a page can use it
 * instead of fetching `GET /events/:id` a second time (B12). `reload` refetches
 * it for the layout and every page at once.
 */
export const EventLayoutContext = createContext<{ event: Event; reload: () => Promise<void> } | null>(null);

export function useLayoutEvent() {
  return useContext(EventLayoutContext);
}
