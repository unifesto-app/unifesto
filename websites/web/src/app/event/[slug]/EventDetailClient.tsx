"use client";

import { optimized } from "@/lib/img";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  CaretDown,
  CaretRight,
  CalendarPlus,
  DeviceMobile,
  DownloadSimple,
  EnvelopeSimple,
  Globe,
  GoogleLogo,
  MapPin,
  MicrosoftOutlookLogo,
  Phone,
  Ticket,
  XCircle,
} from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BrandFooter, BrandHeader, BrandTheme, brandStyle, hasBrandedChrome } from "@/components/BrandedChrome";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { ActionBar, Avatar, Block, Card, FactRow, Rail, ReadMore } from "@/components/DetailParts";
import { registerEventInterest } from "@/lib/api/leads";
import { registrationState, type Event, type SubEventSummary } from "@/lib/api/events";
import { googleCalendarUrl, outlookCalendarUrl, icsDownloadUrl } from "@/lib/calendar";
import { openAppOrStore, useAppHref, useMobilePlatform } from "@/lib/appLinks";
import { withStoredUtm } from "@/lib/utm";

interface Props {
  /** Fetched (and checked public) by the server page, so it all renders in the initial HTML. */
  event: Event;
  /** "5% processing fee, capped at ₹99 per ticket", from the live rate card. */
  buyerFee: string;
}

/** Long agendas start folded to this many slots (as on mobile). */
const AGENDA_PREVIEW = 4;
const PLACE: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };

// Formatted in the event's zone, never the renderer's: the server runs in UTC,
// so local formatting gave wrong times in the HTML and a hydration mismatch.
const fmt = (d: Date, tz: string, o: Intl.DateTimeFormatOptions) => d.toLocaleString("en-IN", { timeZone: tz, ...o });
const time = (d: Date, tz: string) => fmt(d, tz, { hour: "numeric", minute: "2-digit", hour12: true });
const shortDate = (d: Date, tz: string) => fmt(d, tz, { day: "numeric", month: "short" });
const countLabel = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Facts-card date lines: "Saturday, 12 Oct" / "6:30 pm – 9:00 pm", or "12 Oct – 14 Oct" / "From 6:30 pm". */
function whenLines(startIso: string, endIso: string | null | undefined, tz: string) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const day = (d: Date) => fmt(d, tz, { dateStyle: "short" });
  if (!end || day(start) === day(end)) {
    return {
      title: fmt(start, tz, { weekday: "long", day: "numeric", month: "short" }),
      sub: `${time(start, tz)}${end ? ` – ${time(end, tz)}` : ""}`,
    };
  }
  return { title: `${shortDate(start, tz)} – ${shortDate(end, tz)}`, sub: `From ${time(start, tz)}` };
}

/** "Starts in 3h" / "In 5 days" while the event is ahead (mobile countdownLabel). */
function countdownLabel(iso: string, now = new Date()): string {
  const start = new Date(iso);
  const ms = start.getTime() - now.getTime();
  if (ms <= 0) return "Happening now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `Starts in ${Math.max(1, Math.round(ms / 60000))} min`;
  if (hours < 12) return `Starts in ${hours}h`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(start) - day(now)) / 86_400_000);
  if (days <= 0) return "Tonight";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

const noopSubscribe = () => () => {};

/** Shown in place of Register when no ticket can be bought right now. */
const NOT_OPEN = { upcoming: "Registration opens soon", sold_out: "Sold out", closed: "Registration closed" } as const;

/** Upcoming and live sub-events first (soonest first), finished ones after. */
function orderSubEvents(subs: SubEventSummary[]): SubEventSummary[] {
  const done = (s: SubEventSummary) => (s.status === "COMPLETED" ? 1 : 0);
  return [...subs].sort((a, b) => done(a) - done(b) || a.start_date.localeCompare(b.start_date));
}

function subPrice(sub: SubEventSummary): string {
  if (sub.status === "COMPLETED") return "Ended";
  if (sub.is_free || sub.price === 0) return "Free";
  if (typeof sub.price === "number") return `From ${sub.currency === "USD" ? "$" : "₹"}${sub.price.toLocaleString("en-IN")}`;
  return "";
}

export default function EventDetailClient({ event, buyerFee }: Props) {
  // Client-only: a countdown rendered on the server would never match hydration.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { agenda = [], speakers = [], prizes = [], contacts = [], faqs = [] } = event.sections ?? {};
  const [agendaOpen, setAgendaOpen] = useState(false);
  // Captured once so render stays pure; decides whether the event is over.
  const [now] = useState(() => Date.now());
  const appHref = useAppHref(`unifesto://event/${event.slug}`);
  const onPhone = useMobilePlatform() !== "unknown";

  // ── Derived display bits (same rules as the mobile event screen) ──────────
  const isOnline = event.event_type?.toUpperCase() === "ONLINE";
  const status = event.status?.toUpperCase();
  const isCancelled = status === "CANCELLED";
  const isOver =
    isCancelled ||
    status === "COMPLETED" ||
    new Date(event.end_date || event.start_date).getTime() < now;
  const eventSpace = event.space ?? event.organization;
  const coHosts = event.co_hosts ?? [];
  const hosts = eventSpace ? [eventSpace.name, ...coHosts.map((h) => h.name)].join(" & ") : null;
  const imageUrl = event.banner_url || event.thumbnail_url || event.image_url;
  const description = event.description?.trim();
  const appDeepLink = `unifesto://event/${event.slug}`;
  const openApp = (e: React.MouseEvent) => {
    e.preventDefault();
    openAppOrStore(withStoredUtm(appDeepLink));
  };

  const tz = event.timezone || "Asia/Kolkata";
  const start = new Date(event.start_date);
  const chip = { day: fmt(start, tz, { day: "numeric" }), month: fmt(start, tz, { month: "short" }) };
  const when = whenLines(event.start_date, event.end_date, tz);
  const countdown = hydrated ? countdownLabel(event.start_date, new Date(now)) : null;

  const hasVenue = !isOnline && !!(event.venue || event.venue_address || event.city);
  const venueName = event.venue || event.city || "Venue";
  const venueAddress = [event.venue_address, event.venue ? event.city : null].filter(Boolean).join(", ") || null;
  const venueQuery = [event.venue, event.venue_address, event.city, event.state, event.country || "India"]
    .filter(Boolean)
    .join(", ");
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(venueQuery)}`;

  // "Free" · "₹500" · "Starting from ₹500" (multiple paid tiers).
  const currencySymbol = event.currency && event.currency !== "INR" ? event.currency : "₹";
  const priceAmount = `${currencySymbol}${(event.price ?? 0).toLocaleString("en-IN")}`;
  const multiTier = (event.ticket_type_count ?? 0) > 1;
  const priceLabel = event.is_free ? "Free" : multiTier ? `Starting from ${priceAmount}` : priceAmount;

  // State the buyer fee up front, not first at the payment step (A11).
  const feeLine = event.is_free ? undefined : event.fee_included ? "Processing fee included" : `Plus ${buyerFee}`;

  // "Big event" with no tickets of its own: registration is per sub-event.
  const subEvents = event.sub_events ?? [];
  const isUmbrella = subEvents.length > 0 && (event.ticket_type_count ?? 0) === 0;
  const subCount = countLabel(subEvents.length, "sub-event");
  const reg = isUmbrella ? "open" : registrationState(event.tickets, now);
  // Individual tickets, free or paid, register on the web (K10); group ones in the app.
  const webRegister = !isUmbrella && (event.tickets?.some((t) => !t.group) ?? true);
  const bar = isUmbrella
    ? { label: "Multi-part event", value: subCount }
    : event.is_free
      ? { label: "Entry", value: "Free" }
      : { label: multiTier ? "Starting from" : "Entry", value: priceAmount };

  const cal = {
    slug: event.slug,
    title: event.title,
    startIso: event.start_date,
    endIso: event.end_date,
    description: event.description,
    location: isOnline ? null : venueQuery || null,
    customDomain: event.branding?.customDomain,
  };
  const calItem = "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-paper/[0.06]";

  // White-label: theme the wrapper; a live space theme also swaps the chrome.
  const branded = hasBrandedChrome(event.branding) ? event.branding : null;

  const hostedBy = [
    ...(eventSpace ? [{ id: eventSpace.id, name: eventSpace.name, slug: eventSpace.slug, logo_url: eventSpace.logo_url, visibility: eventSpace.visibility }] : []),
    ...coHosts,
  ];

  return (
    <main className={`min-h-screen overflow-x-hidden bg-canvas ${isOver ? "" : "pb-24"}`} style={brandStyle(event.branding)}>
      <BrandTheme branding={event.branding} />
      {branded ? (
        <BrandHeader branding={branded} href={eventSpace?.slug && eventSpace.visibility !== "PRIVATE" ? `/space/${eventSpace.slug}` : `/event/${event.slug}`} />
      ) : (
        <Navbar />
      )}

      {/* ── Hero: clean 4:3 cover beside the name, host and facts ── */}
      <section className="px-5 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto grid max-w-5xl grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-12">
          <div
            className="enter relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-night-2 md:sticky md:top-28"
            style={
              imageUrl
                ? undefined
                : { background: "radial-gradient(120% 120% at 80% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), var(--night-2)" }
            }
          >
            {/* K11: a portrait poster fits whole (contain) over a blurred copy of
                itself, instead of being cropped to 4:3. A 4:3 banner fills as before. */}
            {imageUrl && (
              <>
                <div
                  aria-hidden
                  className="absolute inset-0 scale-110 bg-cover bg-center opacity-60 blur-2xl"
                  style={{ backgroundImage: `url(${optimized(imageUrl, 640)})` }}
                />
                <div
                  role="img"
                  aria-label={`${event.title} poster`}
                  className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${optimized(imageUrl)})` }}
                />
              </>
            )}
            {event.category && (
              <span className="blur-bg absolute bottom-4 left-4 rounded-full px-2.5 py-1 text-[11px] font-semibold text-paper">
                {event.category}
              </span>
            )}
          </div>

          <div>
            {event.parent_event && (
              <Link
                href={`/event/${event.parent_event.slug}`}
                className="enter mb-3 inline-flex max-w-full items-center gap-1 text-sm text-paper/55 transition-colors hover:text-paper"
              >
                <span className="truncate">
                  Part of <span className="font-semibold text-paper">{event.parent_event.title}</span>
                </span>
                <CaretRight className="h-3 w-3 shrink-0" aria-hidden />
              </Link>
            )}

            <h1 className="waterline-load font-display text-[clamp(1.6rem,3.6vw,2.6rem)] leading-[1.15] text-paper [text-wrap:balance]">
              <span className="line">
                <span className="line-inner">{event.title}</span>
              </span>
            </h1>

            {hosts && eventSpace && (
              <Link
                href={`/space/${eventSpace.slug || eventSpace.id}`}
                className="enter mt-3 flex items-center gap-2 text-sm text-paper/55 transition-colors hover:text-paper"
                style={{ ["--d" as string]: "120ms" }}
              >
                <Avatar src={eventSpace.logo_url} name={eventSpace.name} size={26} />
                <span className="truncate">
                  by <span className="font-semibold text-paper">{hosts}</span>
                </span>
              </Link>
            )}

            {/* ── Facts: a ticket-stub date, then where and entry ── */}
            <Card className="enter mt-6" >
              <details className="group [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-4 p-4 transition-colors hover:bg-paper/[0.04]">
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-paper/15 text-center">
                    <span>
                      <span className="block text-[11px] font-semibold text-paper/55">{chip.month}</span>
                      <span className="block font-display text-xl leading-6 text-paper">{chip.day}</span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-paper">{when.title}</span>
                    <span className="mt-0.5 block text-sm text-paper/65">{when.sub}</span>
                    {countdown && !isOver && <span className="mt-0.5 block text-sm text-paper/50">{countdown}</span>}
                  </span>
                  <CalendarPlus className="h-6 w-6 shrink-0 text-paper" aria-label="Add to calendar" />
                </summary>
                <div className="flex flex-col gap-1 px-2 pb-2">
                  <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={calItem}>
                    <GoogleLogo className="h-5 w-5 text-paper/70" aria-hidden />
                    Google Calendar
                  </a>
                  <a href={outlookCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={calItem}>
                    <MicrosoftOutlookLogo className="h-5 w-5 text-paper/70" aria-hidden />
                    Outlook
                  </a>
                  <a href={icsDownloadUrl(event.slug)} className={calItem}>
                    <DownloadSimple className="h-5 w-5 text-paper/70" aria-hidden />
                    Apple / Download .ics
                  </a>
                </div>
              </details>

              {isOnline ? (
                <FactRow icon={<Globe className="h-6 w-6 text-paper" aria-hidden />} title="Online" />
              ) : hasVenue ? (
                <FactRow
                  icon={<MapPin className="h-6 w-6 text-paper" aria-hidden />}
                  title={venueName}
                  sub={venueAddress}
                  href={directionsUrl}
                  external
                />
              ) : (
                <FactRow icon={<MapPin className="h-6 w-6 text-paper/45" aria-hidden />} title="Venue to be announced" />
              )}

              {isCancelled ? (
                <FactRow icon={<XCircle className="h-6 w-6 text-red-400" aria-hidden />} title="This event was cancelled" danger />
              ) : isOver ? (
                <FactRow icon={<Ticket className="h-6 w-6 text-paper/45" aria-hidden />} title="This event has ended" />
              ) : (
                <FactRow
                  icon={<Ticket className="h-6 w-6 text-paper" aria-hidden />}
                  title={isUmbrella ? subCount : priceLabel}
                  sub={reg !== "open" ? NOT_OPEN[reg] : isUmbrella ? undefined : feeLine}
                />
              )}
            </Card>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        {description && (
          <Block title="About">
            <div className="max-w-2xl">
              <ReadMore text={description} />
            </div>
          </Block>
        )}

        {subEvents.length > 0 && (
          <Block id="inside" title="Events inside" subtitle={`${subEvents.length} to choose from`}>
            <Rail>
              {orderSubEvents(subEvents).map((sub) => (
                <Link key={sub.id} href={`/event/${sub.slug}`} className="group block">
                  <div
                    className={`aspect-[4/3] w-full rounded-3xl bg-night-2 bg-cover bg-center transition-opacity group-hover:opacity-90 ${sub.status === "COMPLETED" ? "opacity-60" : ""}`}
                    style={sub.banner_url ? { backgroundImage: `url(${optimized(sub.banner_url, 640)})` } : undefined}
                  />
                  <p className="mt-3 line-clamp-2 text-[15px] font-semibold text-paper">{sub.title}</p>
                  <p className="mt-1 truncate text-sm text-paper/60">
                    {[shortDate(new Date(sub.start_date), tz), sub.venue || sub.city].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-paper/85">{subPrice(sub)}</p>
                </Link>
              ))}
            </Rail>
          </Block>
        )}

        {agenda.length > 0 && (
          <Block title="Schedule" subtitle={countLabel(agenda.length, "slot")}>
            <Card>
              {(agendaOpen ? agenda : agenda.slice(0, AGENDA_PREVIEW)).map((item) => (
                <div key={item.id} className="flex gap-4 border-t border-paper/10 p-4 first:border-t-0">
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-semibold text-paper">{time(new Date(item.start_time), tz)}</p>
                    {item.end_time && <p className="text-xs text-paper/50">{time(new Date(item.end_time), tz)}</p>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-paper">{item.title}</p>
                    {item.description && <p className="mt-1 text-sm leading-relaxed text-paper/65">{item.description}</p>}
                    {item.location && <p className="mt-1 text-xs text-paper/50">{item.location}</p>}
                  </div>
                </div>
              ))}
            </Card>
            {agenda.length > AGENDA_PREVIEW && (
              <button
                type="button"
                onClick={() => setAgendaOpen((o) => !o)}
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-paper"
              >
                {agendaOpen ? "Show less" : `Show all ${agenda.length}`}
                <CaretDown className={`h-3.5 w-3.5 transition-transform ${agendaOpen ? "rotate-180" : ""}`} aria-hidden />
              </button>
            )}
          </Block>
        )}

        {speakers.length > 0 && (
          <Block title="Speakers" subtitle={countLabel(speakers.length, "speaker")}>
            <Rail>
              {speakers.map((s) => (
                <div key={s.id} className="!w-44 rounded-3xl bg-night-2 p-5 text-center">
                  <div className="flex justify-center">
                    <Avatar src={s.profile_image_url} name={s.name} size={72} round />
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-semibold text-paper">{s.name}</p>
                  {s.title && <p className="mt-1 line-clamp-2 text-xs text-paper/55">{s.title}</p>}
                  {s.is_featured && (
                    <span className="mt-3 inline-block rounded-full border border-paper/25 px-2.5 py-0.5 text-[11px] text-paper/75">
                      Featured
                    </span>
                  )}
                </div>
              ))}
            </Rail>
          </Block>
        )}

        {prizes.length > 0 && (
          <Block title="Prizes" subtitle={countLabel(prizes.length, "prize")}>
            <Card>
              {prizes.map((p) => (
                <div key={p.id} className="flex items-start gap-4 border-t border-paper/10 p-4 first:border-t-0">
                  <span className={`w-10 shrink-0 font-display text-sm ${p.position ? "text-paper" : "text-paper/45"}`}>
                    {p.position ? PLACE[p.position] || `${p.position}th` : "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-paper">{p.name}</p>
                    {p.description && <p className="mt-1 text-sm leading-relaxed text-paper/65">{p.description}</p>}
                  </div>
                  {p.value && <span className="shrink-0 text-sm font-semibold text-paper">{p.value}</span>}
                </div>
              ))}
            </Card>
          </Block>
        )}

        {hasVenue && (
          <Block title="Location">
            <Card>
              <iframe
                title={`Map of ${venueName}`}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(venueQuery)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block h-64 w-full border-0 sm:h-80"
              />
              <FactRow
                icon={<MapPin className="h-6 w-6 text-paper" aria-hidden />}
                title={venueName}
                sub={venueAddress}
                href={directionsUrl}
                external
                trailing={<span className="shrink-0 text-sm font-semibold text-paper">Directions</span>}
              />
            </Card>
          </Block>
        )}

        {(event.sponsors?.length ?? 0) > 0 && (
          <Block title="Sponsors and partners">
            <Card>
              {event.sponsors!.map((sp) => {
                const inner = (
                  <>
                    <Avatar src={sp.logo_url} name={sp.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-paper">{sp.name}</p>
                      {sp.tier && (
                        <p className="text-xs" style={{ color: sp.tier.color || undefined }}>
                          <span className={sp.tier.color ? "" : "text-paper/55"}>{sp.tier.name}</span>
                        </p>
                      )}
                      {sp.description && <p className="mt-1 line-clamp-2 text-sm text-paper/65">{sp.description}</p>}
                    </div>
                  </>
                );
                const cls = "flex items-center gap-4 border-t border-paper/10 p-4 first:border-t-0";
                return sp.website_url ? (
                  <a key={sp.event_sponsor_id} href={sp.website_url} target="_blank" rel="noopener noreferrer" className={`${cls} transition-colors hover:bg-paper/[0.04]`}>
                    {inner}
                  </a>
                ) : (
                  <div key={sp.event_sponsor_id} className={cls}>{inner}</div>
                );
              })}
            </Card>
          </Block>
        )}

        {faqs.length > 0 && (
          <Block title="FAQs">
            <Card>
              {faqs.map((f) => (
                <details key={f.id} className="group border-t border-paper/10 first:border-t-0 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-4 p-4">
                    <span className="flex-1 text-[15px] font-semibold text-paper">{f.question}</span>
                    <CaretDown className="h-4 w-4 shrink-0 text-paper/50 transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="-mt-1 px-4 pb-4 text-sm leading-relaxed text-paper/70">{f.answer}</p>
                </details>
              ))}
            </Card>
          </Block>
        )}

        {(hostedBy.length > 0 || contacts.length > 0) && (
          <Block title="Hosted by">
            <Card>
              {hostedBy.map((h) =>
                // A PRIVATE space has no public page (it would 404), so no link.
                h.visibility === "PRIVATE" ? (
                  <div key={h.id} className="flex items-center gap-4 border-t border-paper/10 p-4 first:border-t-0">
                    <Avatar src={h.logo_url} name={h.name} size={44} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-paper">{h.name}</span>
                  </div>
                ) : (
                  <Link
                    key={h.id}
                    href={`/space/${h.slug || h.id}`}
                    className="flex items-center gap-4 border-t border-paper/10 p-4 transition-colors first:border-t-0 hover:bg-paper/[0.04]"
                  >
                    <Avatar src={h.logo_url} name={h.name} size={44} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-paper">{h.name}</span>
                    <CaretRight className="h-4 w-4 shrink-0 text-paper/45" aria-hidden />
                  </Link>
                ),
              )}
              {contacts.map((ct) => (
                <div key={ct.id} className="flex items-center gap-4 border-t border-paper/10 p-4 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-paper">{ct.name}</p>
                    <p className="truncate text-xs text-paper/55">{ct.role || "Contact"}</p>
                  </div>
                  {ct.email && (
                    <a href={`mailto:${ct.email}`} aria-label={`Email ${ct.name}`} className="p-1 text-paper hover:text-paper/70">
                      <EnvelopeSimple className="h-6 w-6" aria-hidden />
                    </a>
                  )}
                  {ct.phone && (
                    <a href={`tel:${ct.phone}`} aria-label={`Call ${ct.name}`} className="p-1 text-paper hover:text-paper/70">
                      <Phone className="h-6 w-6" aria-hidden />
                    </a>
                  )}
                </div>
              ))}
            </Card>
          </Block>
        )}

        {/* Notify me: the web stand-in for the app's "Notify me" sheet. */}
        {!isOver && (
          <section className="mt-14">
            <LeadCaptureForm
              title="Get notified about this event"
              description="Leave your email and we'll tell you if the date or venue changes, and remind you the day before."
              cta="Notify me"
              successText="You're on the list. We'll be in touch."
              onSubmit={(body) => registerEventInterest(event.id, body)}
            />
          </section>
        )}
      </div>

      {branded ? <BrandFooter branding={branded} /> : <Footer />}

      {!isOver && (
        <ActionBar label={bar.label} value={bar.value}>
          {isUmbrella ? (
            <a href="#inside" className="btn btn-lg btn-primary shrink-0">
              View events
            </a>
          ) : reg === "open" && webRegister ? (
            <div className="flex shrink-0 items-center gap-4">
              {onPhone && (
                <a href={appHref} onClick={openApp} className="text-sm font-semibold text-paper/70 hover:text-paper">
                  Open in app
                </a>
              )}
              <Link href={`/event/${event.slug}/register`} className="btn btn-lg btn-primary">
                <Ticket weight="fill" className="h-5 w-5" aria-hidden />
                Register
              </Link>
            </div>
          ) : reg === "open" ? (
            <a href={appHref} onClick={openApp} className="btn btn-lg btn-primary shrink-0">
              <DeviceMobile weight="fill" className="h-5 w-5" aria-hidden />
              Register in app
            </a>
          ) : (
            <span className="shrink-0 text-sm font-semibold text-paper/70">{NOT_OPEN[reg]}</span>
          )}
        </ActionBar>
      )}
    </main>
  );
}
