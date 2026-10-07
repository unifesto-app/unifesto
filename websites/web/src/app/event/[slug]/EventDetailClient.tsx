"use client";

import { optimized } from "@/lib/img";
import Link from "next/link";
import { useState, useEffect, type CSSProperties } from "react";
import {
  CalendarBlank,
  Clock,
  MapPin,
  Tag,
  DeviceMobile,
  Trophy,
  Medal,
  CaretRight,
  ArrowUpRight,
  Star,
  Stack,
  CalendarPlus,
  GoogleLogo,
  MicrosoftOutlookLogo,
  DownloadSimple,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SubEventHub, ParentEventChip } from "@/components/SubEventHub";
import EventSponsors from "@/components/EventSponsors";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { registerEventInterest } from "@/lib/api/leads";
import { getEventBySlug, type Event } from "@/lib/api/events";
import { googleCalendarUrl, outlookCalendarUrl, icsDownloadUrl } from "@/lib/calendar";
import { getSpaceEvents } from "@/lib/api/spaces";
import { openAppOrStore } from "@/lib/appLinks";
import { withStoredUtm } from "@/lib/utm";
import { getEventAdditionalInfo, type AgendaItem, type Speaker, type Prize, type Faq, type Contact } from "@/lib/api/additional-info";
import { brandGradient } from "@/lib/styles";
import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE_IN_OUT_CUBIC } from "@/lib/motion";

interface Props {
  params: Promise<{ slug: string }>;
  /** Fetched by the server page; lets the hero render in the initial HTML. */
  initialEvent?: Event | null;
}

type TabType = "overview" | "subevents" | "agenda" | "speakers" | "rewards" | "faq" | "contact";

export default function EventDetailClient({ params, initialEvent = null }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>(
    (initialEvent?.sub_events?.length ?? 0) > 0 ? "subevents" : "overview"
  );
  const reduce = useReducedMotion();
  const [eventSlug, setEventSlug] = useState<string>(initialEvent?.slug ?? "");
  const [event, setEvent] = useState<Event | null>(initialEvent);
  const [spaceEvents, setSpaceEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(!initialEvent);
  const [isDiscussionOpen, setIsDiscussionOpen] = useState(false);
  
  // Additional info state
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  
  // Load event data
  useEffect(() => {
    const loadEvent = async () => {
      try {
        const { slug } = await params;
        setEventSlug(slug);

        const eventData = initialEvent ?? (await getEventBySlug(slug));
        // The public site only shows events that have been published and are
        // publicly viewable. Unpublished (draft) events and space-only events
        // are treated as not-found; private events stay reachable by direct link.
        const viewable =
          eventData &&
          eventData.status !== "DRAFT" &&
          eventData.visibility !== "SPACE_ONLY";
        if (!viewable) {
          setEvent(null);
          setLoading(false);
          return;
        }
        setEvent(eventData);
        // Render the page now; agenda/speakers/related events fill in after,
        // instead of holding the whole page (and its LCP) behind 3 requests.
        setLoading(false);

        // For a "big event" (a parent with sub-events) the hub is the point of
        // the page, so land on it rather than the generic overview.
        if ((eventData.sub_events?.length ?? 0) > 0) {
          setActiveTab("subevents");
        }

        // Load additional info
        try {
          const additionalInfo = await getEventAdditionalInfo(eventData.id);
          setAgenda(additionalInfo.agenda);
          setSpeakers(additionalInfo.speakers);
          setPrizes(additionalInfo.prizes);
          setContacts(additionalInfo.contacts);
          setFaqs(additionalInfo.faqs);
        } catch (error) {
          console.error('Error loading additional info:', error);
          // Continue without additional info
        }
        
        // Load other events from the same space
        const eventSpaceId = eventData.space_id ?? eventData.organization_id;
        if (eventSpaceId) {
          const { events } = await getSpaceEvents(eventSpaceId, 1, 6);
          // Filter out current event
          setSpaceEvents(events.filter((e: Event) => e.slug !== slug));
        }
      } catch (error) {
        console.error('Error loading event:', error);
        // A failed side fetch must not blank an event we already have.
        if (!initialEvent) setEvent(null);
        setLoading(false);
      }
    };
    
    loadEvent();
  }, [params, initialEvent]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isDiscussionOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isDiscussionOpen]);

  if (loading) {
    return (
      <main className="min-h-screen bg-canvas">
        <Navbar />
        {/* Hero skeleton mirrors the real layout so nothing jumps on load */}
        <div className="relative min-h-[420px] animate-pulse bg-night-2 pt-20 md:min-h-[520px]" />
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-10 w-full animate-pulse rounded-lg bg-paper/[0.05]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-paper/[0.05]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-paper/[0.05]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-paper/[0.05]" />
            </div>
            <div className="space-y-4 lg:col-span-1">
              <div className="h-48 w-full animate-pulse rounded-3xl bg-paper/[0.05]" />
              <div className="h-28 w-full animate-pulse rounded-3xl bg-paper/[0.05]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex min-h-screen flex-col bg-canvas">
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-6 py-20 text-center">
          <div>
            <h1 className="mb-3 text-2xl font-bold text-white">Event not found</h1>
            <p className="mb-6 text-sm text-paper/75">
              This event doesn&apos;t exist or has been removed.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgb(var(--glow)/0.4)]"
              style={{ background: brandGradient }}
            >
              Browse events
              <CaretRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // Format date and time. Events can span multiple days, so show a start–end
  // range for both the date and the time.
  const startDate = new Date(event.start_date);
  const endDate = event.end_date ? new Date(event.end_date) : null;
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true };
  const sameDay =
    endDate && startDate.toDateString() === endDate.toDateString();
  const formattedDate = endDate && !sameDay
    ? `${startDate.toLocaleDateString('en-US', dateOpts)} – ${endDate.toLocaleDateString('en-US', dateOpts)}`
    : startDate.toLocaleDateString('en-US', dateOpts);
  const formattedTime = endDate
    ? `${startDate.toLocaleTimeString('en-US', timeOpts)} – ${endDate.toLocaleTimeString('en-US', timeOpts)}`
    : startDate.toLocaleTimeString('en-US', timeOpts);
  const location = event.venue || event.city || event.state || 'Online';
  const eventSpace = event.space ?? event.organization;
  const organizerName = eventSpace?.name || 'Organizer';
  const imageUrl = event.banner_url || event.thumbnail_url || event.image_url;
  const isCompleted = event.status === 'CANCELLED' || event.status === 'completed' || event.status === 'cancelled';
  // Price is derived from actual ticket types (see mapEvent), like the app.
  const isFree = event.is_free;
  const currencySymbol = event.currency && event.currency !== 'INR' ? event.currency : '₹';
  const priceAmount = `${currencySymbol}${(event.price ?? 0).toLocaleString('en-IN')}`;
  const hasMultipleTiers = (event.ticket_type_count ?? 0) > 1;
  // "Free" · "₹500" · "Starting from ₹500" (multiple paid tiers), matching mobile.
  const priceLabel = isFree
    ? 'Free'
    : hasMultipleTiers
    ? `Starting from ${priceAmount}`
    : priceAmount;
  // App deep link for this event (used by the register / open-in-app CTAs).
  const appDeepLink = `unifesto://event/${event.slug}`;

  // "Big event" mode (derived, not stored): a parent with sub-events. If the
  // parent sells its own tickets it's a "full pass" event; otherwise it's a
  // pure umbrella where attendees register per sub-event.
  const subEventCount = event.sub_events?.length ?? 0;
  const isParent = subEventCount > 0;
  const parentHasOwnTickets = (event.ticket_type_count ?? 0) > 0;
  const bigEventMode: "pass" | "umbrella" | null = isParent
    ? parentHasOwnTickets
      ? "pass"
      : "umbrella"
    : null;

  // On-brand fallback for missing artwork — a radial tint of the page accent
  // (`--primary`, overridden below for white-label), so a poster-less event
  // still reads as part of the system and recolours with the organiser's brand.
  const posterFallback =
    "radial-gradient(120% 120% at 80% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), var(--night-2)";

  // White-label: when the organiser has approved branding, recolour the page
  // to their accent by overriding the `--primary`/`--accent` CSS variables on
  // this wrapper only. Every `text-primary` / `bg-primary` element below maps
  // to these vars, so the whole page adopts the colour without leaking to the
  // rest of the site. `branding` is null for non-white-labelled events.
  const brandColor = event.branding?.color || undefined;
  const brandStyle = brandColor
    ? ({ "--primary": brandColor, "--accent": brandColor } as CSSProperties)
    : undefined;

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-canvas pb-24 md:pb-0"
      style={brandStyle}
    >
      <Navbar />

      {/* Hero: a compact 4:3 poster beside the facts (never cropped, text
          beside it rather than over it). Stacks on small screens. */}
      <section className="px-5 pb-6 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-12">
          <div
            className="enter aspect-[4/3] w-full overflow-hidden rounded-3xl bg-night-2 bg-cover bg-center shadow-[0_32px_64px_-32px_rgba(0,0,0,0.6)]"
            style={imageUrl ? { backgroundImage: `url(${optimized(imageUrl)})` } : { background: posterFallback }}
            role={imageUrl ? "img" : undefined}
            aria-label={imageUrl ? `${event.title} poster` : undefined}
          />
          <div>
            <nav aria-label="Breadcrumb" className="enter mb-5 flex items-center gap-2 text-xs text-paper/60">
              <Link href="/events" className="link-draw transition-colors duration-150 hover:text-paper">
                Events
              </Link>
              <CaretRight className="h-3 w-3" aria-hidden="true" />
              <span className="text-paper/80">{event.category || "Event"}</span>
            </nav>

            {event.parent_event && (
              <div className="mb-4">
                <ParentEventChip parent={event.parent_event} />
              </div>
            )}

            {(event.is_trending || event.is_featured || (event.tags?.length ?? 0) > 0) && (
              <div className="enter mb-5 flex flex-wrap items-center gap-2" style={{ ["--d" as string]: "60ms" }}>
                {event.is_trending && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-ink">
                    <Star weight="fill" className="h-3 w-3" aria-hidden="true" />
                    Trending
                  </span>
                )}
                {event.is_featured && (
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">Featured</span>
                )}
                {event.tags?.slice(0, 3).map((tag: string) => (
                  <span key={tag} className="rounded-full bg-paper/[0.07] px-2.5 py-1 text-[11px] font-medium text-paper/80">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <h1
              className="waterline-load font-display text-[clamp(1.9rem,4.2vw,3.1rem)] font-bold leading-[1.04] text-paper [text-wrap:balance]"
              style={{ letterSpacing: "-0.035em" }}
            >
              <span className="line">
                <span className="line-inner">{event.title}</span>
              </span>
            </h1>
            <p className="enter mt-3 text-sm text-paper/65" style={{ ["--d" as string]: "200ms" }}>
              by {organizerName}
            </p>

            <div className="enter mt-6 flex flex-col gap-2.5 text-sm text-paper/85" style={{ ["--d" as string]: "280ms" }}>
              <span className="inline-flex items-center gap-2.5">
                <CalendarBlank className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                {formattedDate}
              </span>
              <span className="inline-flex items-center gap-2.5">
                <MapPin className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                {location}
              </span>
              <span className="inline-flex items-center gap-2.5 font-semibold text-paper">
                <Tag className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                {priceLabel}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Event Info Section */}
      <div className="mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Tabs */}
            <div>
              <div className="flex gap-1 overflow-x-auto rounded-full bg-night-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Event sections">
                {[
                  { id: "overview", label: "Overview" },
                  ...((event.sub_events?.length ?? 0) > 0
                    ? [{ id: "subevents", label: "Sub-events" }]
                    : []),
                  ...(agenda.length > 0 ? [{ id: "agenda", label: "Agenda" }] : []),
                  ...(speakers.length > 0 ? [{ id: "speakers", label: "Speakers" }] : []),
                  ...(prizes.length > 0 ? [{ id: "rewards", label: "Prizes" }] : []),
                  ...(faqs.length > 0 ? [{ id: "faq", label: "FAQ" }] : []),
                  { id: "contact", label: "Contact" },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={`relative whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                        isActive ? "text-primary-foreground" : "text-paper/65 hover:text-paper"
                      }`}
                    >
                      {isActive && (
                        <motion.span
                          layoutId="event-tab"
                          aria-hidden="true"
                          className="absolute inset-0 rounded-full bg-primary"
                          transition={reduce ? { duration: 0 } : { duration: DUR.swap, ease: EASE_IN_OUT_CUBIC }}
                        />
                      )}
                      <span className="relative">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {/* Overview Tab */}
              {activeTab === "overview" && (
                <div className="space-y-10">
                  {/* About */}
                  <section>
                    <h2 className="mb-3 text-lg font-bold text-white">About this event</h2>
                    <div className="space-y-3 text-sm leading-relaxed text-paper/75">
                      {event.description ? (
                        event.description.split("\n\n").map((para: string, i: number) => (
                          <p key={i}>{para}</p>
                        ))
                      ) : (
                        <p className="text-paper/65">No description available for this event yet.</p>
                      )}
                    </div>
                  </section>

                  {/* Event Details */}
                  <section>
                    <h2 className="mb-4 text-lg font-bold text-white">Event details</h2>
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="flex items-start gap-3 rounded-2xl bg-night-2 p-5">
                        <CalendarBlank className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-paper/65">Date &amp; time</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-white">{formattedDate}</dd>
                          <dd className="text-sm text-paper/75">{formattedTime}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-night-2 p-5">
                        <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-paper/65">Location</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-white">{location}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-2xl bg-night-2 p-5">
                        <Tag className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-paper/65">Price</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-white">{priceLabel}</dd>
                        </div>
                      </div>
                    </dl>
                  </section>

                  {/* Sponsors & partners */}
                  <EventSponsors sponsors={event.sponsors} />

                  {/* Notify me — capture interest from people not yet registered */}
                  <LeadCaptureForm
                    title="Get notified about this event"
                    description="Leave your email and we'll keep you posted on updates and reminders."
                    cta="Notify me"
                    successText="You're on the list — we'll be in touch."
                    onSubmit={(body) => registerEventInterest(event.id, body)}
                  />
                </div>
              )}

              {/* Sub-events Tab — the hub of a "big event" */}
              {activeTab === "subevents" && (
                <SubEventHub
                  subEvents={event.sub_events ?? []}
                  mode={bigEventMode ?? "umbrella"}
                />
              )}

              {/* Agenda Tab — timeline */}
              {activeTab === "agenda" && (
                <div>
                  <h2 className="mb-5 text-lg font-bold text-white">Event agenda</h2>
                  <ol className="relative space-y-5 pl-7 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-paper/15" data-stagger="rise">
                    {agenda.map((item) => (
                      <li key={item.id} className="relative">
                        <span
                          className="absolute -left-7 top-5 flex h-4 w-4 items-center justify-center rounded-full bg-primary/25"
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        </span>
                        <div className="rounded-3xl bg-night-2 p-6">
                          <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            {new Date(item.start_time).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                            {item.end_time &&
                              ` – ${new Date(item.end_time).toLocaleTimeString("en-US", {
                                hour: "numeric",
                                minute: "2-digit",
                              })}`}
                          </div>
                          <h3 className="mb-1.5 text-base font-bold text-white">{item.title}</h3>
                          {item.description && (
                            <p className="mb-2 text-sm leading-relaxed text-paper/75">{item.description}</p>
                          )}
                          {item.location && (
                            <div className="flex items-center gap-1.5 text-xs text-paper/65">
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                              <span>{item.location}</span>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Speakers Tab */}
              {activeTab === "speakers" && (
                <div>
                  <h2 className="mb-5 text-lg font-bold text-white">Speakers &amp; guests</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {speakers.map((speaker) => (
                      <div key={speaker.id} className="rounded-3xl bg-night-2 p-6">
                        <div className="flex items-start gap-4">
                          {speaker.profile_image_url ? (
                            <img
                              src={speaker.profile_image_url}
                              alt={speaker.name}
                              className="h-16 w-16 flex-shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-2xl font-bold text-black"
                              style={{ background: brandColor ?? brandGradient }}
                              aria-hidden="true"
                            >
                              {speaker.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1">
                            <h3 className="mb-0.5 text-base font-bold text-white">{speaker.name}</h3>
                            {speaker.title && <p className="mb-2 text-xs text-paper/65">{speaker.title}</p>}
                            {speaker.bio && (
                              <p className="line-clamp-3 text-sm leading-relaxed text-paper/75">{speaker.bio}</p>
                            )}
                            {speaker.is_featured && (
                              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">
                                <Star weight="fill" className="h-3 w-3" aria-hidden="true" />
                                Featured speaker
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prizes Tab */}
              {activeTab === "rewards" && (
                <div>
                  <h2 className="mb-5 text-lg font-bold text-white">Prizes &amp; rewards</h2>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {prizes.map((prize) => (
                      <div
                        key={prize.id}
                        className="rounded-3xl bg-night-2 p-6"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-amber-400/20">
                            {prize.position && prize.position <= 3 ? (
                              <Medal weight="fill" className="h-7 w-7 text-amber-300" aria-hidden="true" />
                            ) : (
                              <Trophy weight="fill" className="h-7 w-7 text-amber-300" aria-hidden="true" />
                            )}
                          </div>
                          <div className="flex-1">
                            {prize.position && (
                              <span className="mb-2 inline-block rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-bold text-amber-200">
                                {prize.position === 1
                                  ? "1st place"
                                  : prize.position === 2
                                    ? "2nd place"
                                    : prize.position === 3
                                      ? "3rd place"
                                      : `#${prize.position}`}
                              </span>
                            )}
                            <h3 className="mb-1.5 text-base font-bold text-white">{prize.name}</h3>
                            {prize.description && (
                              <p className="mb-2 text-sm leading-relaxed text-paper/75">{prize.description}</p>
                            )}
                            {prize.value && (
                              <p className="text-base font-semibold text-amber-300">{prize.value}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FAQ Tab — only rendered when faqs exist, so no fabricated fallback */}
              {activeTab === "faq" && (
                <div>
                  <h2 className="mb-5 text-lg font-bold text-white">Frequently asked questions</h2>
                  <div className="space-y-3">
                    {faqs.map((faq) => (
                      <div key={faq.id} className="rounded-3xl bg-night-2 p-6">
                        <h3 className="mb-1.5 text-sm font-semibold text-white">{faq.question}</h3>
                        <p className="text-sm leading-relaxed text-paper/75">{faq.answer}</p>
                        {faq.category && (
                          <span className="mt-2 inline-block rounded bg-white/5 px-2 py-1 text-xs text-paper/65">
                            {faq.category}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Tab */}
              {activeTab === "contact" && (
                <section>
                  <h2 className="mb-4 text-lg font-bold text-white">Contact organizers</h2>
                  {contacts.length > 0 && (
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="rounded-3xl bg-night-2 p-6"
                        >
                          <h3 className="text-base font-bold text-white">{contact.name}</h3>
                          {contact.role && (
                            <p className="mb-2 text-xs text-paper/65">{contact.role}</p>
                          )}
                          <div className="space-y-1 text-sm">
                            {contact.email && (
                              <a
                                href={`mailto:${contact.email}`}
                                className="block text-primary transition-colors hover:text-white"
                              >
                                {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a
                                href={`tel:${contact.phone}`}
                                className="block text-paper/75 transition-colors hover:text-white"
                              >
                                {contact.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-3xl bg-night-2 p-6">
                    <h3 className="mb-2 text-base font-bold text-white">{organizerName}</h3>
                    <p className="mb-4 text-sm text-paper/75">
                      For questions about this event, reach the organizers through the Unifesto mobile app.
                    </p>
                    <a
                      href={appDeepLink}
                      onClick={(e) => {
                        e.preventDefault();
                        openAppOrStore(withStoredUtm(appDeepLink));
                      }}
                      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_20px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
                      style={{ background: brandColor ?? brandGradient }}
                    >
                      <DeviceMobile className="h-4 w-4" aria-hidden="true" />
                      Open in app
                    </a>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-5">
              {/* Register CTA — primary action, top of hierarchy.
                  For an umbrella "big event" (parent with sub-events but no
                  tickets of its own), registration happens per sub-event, so we
                  point at the hub instead of a misleading "Free · register" CTA. */}
              {bigEventMode === "umbrella" ? (
                <div className="rounded-3xl bg-primary/[0.1] p-6">
                  <div className="mb-1 flex items-center gap-2">
                    <Stack weight="fill" className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span className="text-base font-extrabold text-white">Multi-part event</span>
                  </div>
                  <p className="mb-4 text-xs text-paper/75">
                    {isCompleted
                      ? "This event has ended."
                      : `This event has ${subEventCount} sub-event${subEventCount === 1 ? "" : "s"}. Register for the ones you want to attend.`}
                  </p>
                  {!isCompleted && (
                    <button
                      onClick={() => setActiveTab("subevents")}
                      className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
                      style={{ background: brandColor ?? brandGradient }}
                    >
                      <Stack weight="fill" className="h-5 w-5" aria-hidden="true" />
                      View sub-events
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-3xl bg-primary/[0.1] p-6">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-white">{priceLabel}</span>
                    {!isFree && (
                      <span className="text-xs text-paper/65">per ticket</span>
                    )}
                  </div>
                  {bigEventMode === "pass" && (
                    <p className="mb-1 text-xs font-semibold text-primary">Full event pass</p>
                  )}
                  <p className="mb-4 text-xs text-paper/75">
                    {isCompleted
                      ? "This event has ended."
                      : bigEventMode === "pass"
                      ? "This pass covers the overall event. Some sub-events may need separate registration."
                      : "Register in the Unifesto app to save your spot."}
                  </p>
                  {!isCompleted && (
                    <a
                      href={appDeepLink}
                      onClick={(e) => {
                        e.preventDefault();
                        openAppOrStore(withStoredUtm(appDeepLink));
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
                      style={{ background: brandColor ?? brandGradient }}
                    >
                      <DeviceMobile weight="fill" className="h-5 w-5" aria-hidden="true" />
                      Open in the Unifesto app
                    </a>
                  )}
                </div>
              )}

              {/* Add to calendar — Google / Outlook / .ics. Native <details> so
                  there's no extra state to manage; closes on outside click. */}
              <details className="group [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-full bg-primary/[0.12] px-4 py-3 text-sm font-bold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/[0.14]">
                  <CalendarPlus weight="bold" className="h-5 w-5" aria-hidden="true" />
                  Add to calendar
                  <CaretRight
                    weight="bold"
                    className="h-4 w-4 transition-transform duration-200 group-open:rotate-90"
                    aria-hidden="true"
                  />
                </summary>
                <div className="animate-pop-in mt-2 flex origin-top flex-col gap-1 rounded-3xl bg-night-2 p-2">
                  {(() => {
                    const cal = {
                      slug: event.slug,
                      title: event.title,
                      startIso: event.start_date,
                      endIso: event.end_date,
                      description: event.description,
                      location: location === "Online" ? null : location,
                    };
                    const item =
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.06]";
                    return (
                      <>
                        <a href={googleCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={item}>
                          <GoogleLogo weight="bold" className="h-5 w-5 text-paper/75" aria-hidden="true" />
                          Google Calendar
                        </a>
                        <a href={outlookCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={item}>
                          <MicrosoftOutlookLogo weight="bold" className="h-5 w-5 text-paper/75" aria-hidden="true" />
                          Outlook
                        </a>
                        <a href={icsDownloadUrl(event.slug)} className={item}>
                          <DownloadSimple weight="bold" className="h-5 w-5 text-paper/75" aria-hidden="true" />
                          Apple / Download .ics
                        </a>
                      </>
                    );
                  })()}
                </div>
              </details>

              {/* Event Info Card */}
              <div className="rounded-3xl bg-night-2 p-6">
                <h3 className="mb-4 text-sm font-bold text-white">Event information</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="mb-0.5 text-xs text-paper/65">Date</dt>
                    <dd className="font-semibold text-white">{formattedDate}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs text-paper/65">Time</dt>
                    <dd className="font-semibold text-white">{formattedTime}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs text-paper/65">Location</dt>
                    <dd className="font-semibold text-white">{location}</dd>
                  </div>
                </dl>
              </div>

              {/* Organizer Card */}
              {eventSpace && (
                <div className="rounded-3xl bg-night-2 p-6">
                  <h3 className="mb-4 text-sm font-bold text-white">Organized by</h3>
                  <Link href={`/space/${eventSpace.slug || eventSpace.id}`} className="group block">
                    <div className="flex items-center gap-3">
                      {eventSpace.logo_url ? (
                        <img
                          src={eventSpace.logo_url}
                          alt={organizerName}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-lg text-sm font-bold text-black"
                          style={{ background: brandColor ?? brandGradient }}
                          aria-hidden="true"
                        >
                          {organizerName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white transition-colors group-hover:text-primary">
                          {organizerName}
                        </p>
                        <p className="inline-flex items-center gap-1 text-xs text-paper/65">
                          View profile
                          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>
              )}

              {/* More Events */}
              {spaceEvents.length > 0 && (
                <div className="rounded-3xl bg-night-2 p-6">
                  <h3 className="mb-4 text-sm font-bold text-white">More from {organizerName}</h3>
                  <div className="space-y-3">
                    {spaceEvents.slice(0, 3).map((e) => (
                      <Link key={e.id} href={`/event/${e.slug || e.id}`} className="group block">
                        <div className="flex gap-3">
                          <div
                            className="h-16 w-16 flex-shrink-0 rounded-lg"
                            style={
                              e.banner_url || e.thumbnail_url || e.image_url
                                ? {
                                    backgroundImage: `url(${optimized(e.banner_url || e.thumbnail_url || e.image_url || "", 128)})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }
                                : { background: posterFallback }
                            }
                            aria-hidden="true"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="mb-1 line-clamp-2 text-sm font-semibold text-white transition-colors group-hover:text-primary">
                              {e.title}
                            </p>
                            <p className="text-xs text-paper/65">
                              {new Date(e.start_date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
