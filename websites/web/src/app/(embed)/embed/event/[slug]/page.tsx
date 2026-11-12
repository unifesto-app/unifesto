import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEventBySlug, outsideRegistration, registrationState, type Event } from "@/lib/api/events";
import { optimized } from "@/lib/img";
import { cardButtonLook } from "@/console/lib/register-button";

interface Props {
  params: Promise<{ slug: string }>;
  // A repeated param arrives as an array: only plain strings are read (see str below).
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const CLOSED = { upcoming: "Registration opens soon", sold_out: "Sold out", closed: "Registration closed" } as const;

/** The embedding site's name as a utm_source tag, same shape as the console's. */
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const sourceTag = (v: unknown) =>
  (str(v) ?? "").toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "embed";

function priceLabel(e: Event): string | null {
  if (e.is_free) return "Free";
  if (e.price == null) return null;
  const amount = `${e.currency && e.currency !== "INR" ? e.currency : "₹"}${e.price.toLocaleString("en-IN")}`;
  return (e.ticket_type_count ?? 0) > 1 ? `From ${amount}` : amount;
}

/**
 * An event card other sites frame (K21): cover, date, place, price, seats left
 * and Register, which opens Unifesto (or the organiser's own registration
 * site) in a new tab. No sign-in, forms or state inside the frame.
 *
 *   <iframe src="https://www.unifesto.app/embed/event/<slug>?source=<site>&theme=light" …>
 *   Optional, from the console's button settings: label, bg and fg (hex), shape.
 */
export default async function EmbedEventCard({ params, searchParams }: Props) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  // Only a 404 is "no such event"; an API blip errors instead of showing a missing card.
  // ponytail: one API call per frame load (dynamic page); cache the fetch if a busy host site shows up in the API load.
  const event = await getEventBySlug(slug);
  // Same public rule as the event page.
  if (!event || event.status === "DRAFT" || event.visibility === "SPACE_ONLY") notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const tz = event.timezone || "Asia/Kolkata";
  const when = new Date(event.start_date).toLocaleString("en-IN", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const place = event.event_type?.toUpperCase() === "ONLINE" ? "Online" : [event.venue, event.city].filter(Boolean).join(", ");
  // A server component rendered per request (it reads searchParams), so the clock is read once, here.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const over = event.status === "COMPLETED" || event.status === "CANCELLED" || new Date(event.end_date || event.start_date).getTime() < now;
  const outside = outsideRegistration(event);
  const state = registrationState(event.tickets, now);
  const seatsLeft = event.max_attendees ? Math.max(0, event.max_attendees - (event.registered_count ?? 0)) : null;
  const price = outside ? `Registration on ${outside.host}` : priceLabel(event);

  // Tagged so these sign-ups show as the embedding site in the event's sources.
  const tags = new URLSearchParams({ utm_source: sourceTag(q.source), utm_medium: "embed", utm_campaign: event.slug });
  const webRegister = event.tickets?.some((t) => !t.group) ?? true;
  const href = outside
    ? outside.href
    : `/event/${encodeURIComponent(event.slug)}${webRegister ? "/register" : ""}?${tags}`;
  const image = event.banner_url || event.thumbnail_url || event.image_url;
  // The organiser's button look from the console (hex colours, known shapes, short label only).
  const button = cardButtonLook(q);

  return (
    <>
      {/* The organiser picks the card's theme to match their page; dark is the site default. */}
      {str(q.theme) === "light" && (
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "document.documentElement.dataset.theme='light'" }} />
      )}
      <article className="mx-auto max-w-md overflow-hidden rounded-2xl bg-night-2 text-paper">
        {image && (
          <div
            role="img"
            aria-label={event.title}
            className="aspect-[4/3] w-full bg-night-3 bg-cover bg-center"
            style={{ backgroundImage: `url(${optimized(image, 750)})` }}
          />
        )}
        <div className="space-y-3 p-5">
          <p className="text-sm text-paper/60">{when}</p>
          <h1 className="font-display text-xl leading-tight">{event.title}</h1>
          {place && <p className="text-sm text-paper/70">{place}</p>}
          <div className="flex items-center justify-between gap-4 pt-2">
            <div className="min-w-0 text-sm">
              {price && <p className="truncate font-semibold">{price}</p>}
              {!outside && !over && seatsLeft !== null && state === "open" && (
                <p className="text-paper/60">{seatsLeft === 0 ? "Full" : `${seatsLeft} seats left`}</p>
              )}
            </div>
            {over ? (
              <span className="shrink-0 text-sm text-paper/60">{event.status === "CANCELLED" ? "Cancelled" : "Ended"}</span>
            ) : !outside && state !== "open" ? (
              <span className="shrink-0 text-sm text-paper/60">{CLOSED[state]}</span>
            ) : (
              <a href={href} target="_blank" rel="noopener" className="btn btn-primary shrink-0" style={button.style}>
                {button.label}
              </a>
            )}
          </div>
          <p className="text-xs text-paper/45">
            On <a href={`/event/${encodeURIComponent(event.slug)}?${tags}`} target="_blank" rel="noopener" className="underline-offset-4 hover:underline">Unifesto</a>
          </p>
        </div>
      </article>
    </>
  );
}
