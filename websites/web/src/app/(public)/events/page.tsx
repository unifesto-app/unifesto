import { preload } from "react-dom";
import { getListedEvents, filterEvents } from "@/lib/api/events";
import { optimized } from "@/lib/img";
import EventsClient from "./EventsClient";

// Fetch the list on the server (cached 10 min) so the grid renders without
// waiting on a client-side API round trip; that wait was the page's LCP.
export const revalidate = 600;

export default async function EventsPage() {
  // getEvents returns [] on API errors, so treat empty as "no seed" and let
  // the client fetch rather than caching an empty page for 10 minutes.
  const events = await getListedEvents();

  // The grid renders client-side (useSearchParams), so its first image isn't
  // in the HTML. Preload the first one on screen: featured strip, else grid.
  const first =
    events.find((e) => e.is_featured || e.is_trending) ??
    filterEvents(events, { query: "", category: "All", status: "all", price: "all", dateRange: "all" })[0];
  const image = first && (first.banner_url || first.thumbnail_url || first.image_url);
  if (image) preload(optimized(image, 750), { as: "image", fetchPriority: "high" });

  return <EventsClient initialEvents={events.length ? events : null} />;
}
