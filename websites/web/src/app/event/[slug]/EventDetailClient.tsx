"use client";

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

interface Props {
  params: Promise<{ slug: string }>;
}

type TabType = "overview" | "subevents" | "agenda" | "speakers" | "rewards" | "faq" | "contact";

export default function EventDetailClient({ params }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [eventSlug, setEventSlug] = useState<string>("");
  const [event, setEvent] = useState<Event | null>(null);
  const [spaceEvents, setSpaceEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
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
        setLoading(true);
        
        const eventData = await getEventBySlug(slug);
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
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading event:', error);
        setEvent(null);
        setLoading(false);
      }
    };
    
    loadEvent();
  }, [params]);

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
      <main className="min-h-screen bg-black">
        <Navbar />
        {/* Hero skeleton mirrors the real layout so nothing jumps on load */}
        <div className="relative min-h-[420px] animate-pulse bg-white/[0.03] pt-20 md:min-h-[520px]" />
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.04]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.04]" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/[0.04]" />
            </div>
            <div className="space-y-4 lg:col-span-1">
              <div className="h-48 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
              <div className="h-28 w-full animate-pulse rounded-2xl bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (!event) {
    return (
      <main className="flex min-h-screen flex-col bg-black">
        <Navbar />
        <div className="flex flex-1 items-center justify-center px-6 py-20 text-center">
          <div>
            <h1 className="mb-3 text-2xl font-bold text-white">Event not found</h1>
            <p className="mb-6 text-sm text-slate-300">
              This event doesn&apos;t exist or has been removed.
            </p>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(52,145,255,0.4)]"
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
    "radial-gradient(120% 120% at 80% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 60%), #0a0a0d";

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
      className="min-h-screen bg-black overflow-x-hidden pb-24 md:pb-0"
      style={brandStyle}
    >
      <Navbar />

      {/* Hero — matches the space banner sizing (aspect-[4/3]) */}
      <section
        className="relative mt-20 flex aspect-[4/3] items-end overflow-hidden px-6 pb-10 pt-24 md:mt-24"
        style={
          imageUrl
            ? { backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: posterFallback }
        }
      >
        {/* Overlay to guarantee legible text over any artwork */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/20"
          aria-hidden="true"
        />
        <div className="relative z-10 mx-auto w-full max-w-5xl">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-2 text-xs text-white/60">
            <Link href="/events" className="transition-colors hover:text-white">
              Events
            </Link>
            <CaretRight className="h-3 w-3" aria-hidden="true" />
            <span className="text-white/80">{event.category || "Event"}</span>
          </nav>

          {/* Parent "big event" link — shown only on a sub-event's page */}
          {event.parent_event && (
            <div className="mb-4">
              <ParentEventChip parent={event.parent_event} />
            </div>
          )}

          {/* Badges + tags */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {event.is_trending && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-200">
                <Star weight="fill" className="h-3 w-3" aria-hidden="true" />
                Trending
              </span>
            )}
            {event.is_featured && (
              <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                Featured
              </span>
            )}
            {event.tags?.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm"
              >
                {tag}
              </span>
            ))}
          </div>

          <h1 className="mb-3 max-w-3xl text-3xl font-extrabold leading-tight text-white md:text-5xl">
            {event.title}
          </h1>
          <p className="mb-5 text-sm text-white/70">by {organizerName}</p>

          {/* Fact row: the three things a student decides on at a glance */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
            <span className="inline-flex items-center gap-2">
              <CalendarBlank className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              {formattedDate}
            </span>
            <span className="inline-flex items-center gap-2">
              <MapPin className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              {location}
            </span>
            <span className="inline-flex items-center gap-2 font-semibold text-white">
              <Tag className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              {priceLabel}
            </span>
          </div>
        </div>
      </section>

      {/* Event Info Section */}
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Tabs */}
            <div className="border-b border-white/10">
              <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Event sections">
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
                      className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isActive
                          ? "border-primary text-white"
                          : "border-transparent text-slate-400 hover:text-white"
                      }`}
                    >
                      {tab.label}
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
                    <div className="space-y-3 text-sm leading-relaxed text-slate-300">
                      {event.description ? (
                        event.description.split("\n\n").map((para: string, i: number) => (
                          <p key={i}>{para}</p>
                        ))
                      ) : (
                        <p className="text-slate-400">No description available for this event yet.</p>
                      )}
                    </div>
                  </section>

                  {/* Event Details */}
                  <section>
                    <h2 className="mb-4 text-lg font-bold text-white">Event details</h2>
                    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/5 sm:grid-cols-2">
                      <div className="flex items-start gap-3 bg-black/40 p-4">
                        <CalendarBlank className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-slate-400">Date &amp; time</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-white">{formattedDate}</dd>
                          <dd className="text-sm text-slate-300">{formattedTime}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-black/40 p-4">
                        <MapPin className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-slate-400">Location</dt>
                          <dd className="mt-0.5 text-sm font-semibold text-white">{location}</dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 bg-black/40 p-4">
                        <Tag className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <div>
                          <dt className="text-xs font-medium text-slate-400">Price</dt>
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
                  <ol className="relative space-y-5 border-l border-white/10 pl-6">
                    {agenda.map((item) => (
                      <li key={item.id} className="relative">
                        <span
                          className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-black"
                          aria-hidden="true"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        </span>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
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
                            <p className="mb-2 text-sm leading-relaxed text-slate-300">{item.description}</p>
                          )}
                          {item.location && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
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
                      <div key={speaker.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
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
                            {speaker.title && <p className="mb-2 text-xs text-slate-400">{speaker.title}</p>}
                            {speaker.bio && (
                              <p className="line-clamp-3 text-sm leading-relaxed text-slate-300">{speaker.bio}</p>
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
                        className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-5"
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
                              <p className="mb-2 text-sm leading-relaxed text-slate-300">{prize.description}</p>
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
                      <div key={faq.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                        <h3 className="mb-1.5 text-sm font-semibold text-white">{faq.question}</h3>
                        <p className="text-sm leading-relaxed text-slate-300">{faq.answer}</p>
                        {faq.category && (
                          <span className="mt-2 inline-block rounded bg-white/5 px-2 py-1 text-xs text-slate-400">
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
                          className="rounded-2xl border border-white/10 bg-white/[0.02] p-5"
                        >
                          <h3 className="text-base font-bold text-white">{contact.name}</h3>
                          {contact.role && (
                            <p className="mb-2 text-xs text-slate-400">{contact.role}</p>
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
                                className="block text-slate-300 transition-colors hover:text-white"
                              >
                                {contact.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                    <h3 className="mb-2 text-base font-bold text-white">{organizerName}</h3>
                    <p className="mb-4 text-sm text-slate-300">
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
                <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
                  <div className="mb-1 flex items-center gap-2">
                    <Stack weight="fill" className="h-5 w-5 text-primary" aria-hidden="true" />
                    <span className="text-base font-extrabold text-white">Multi-part event</span>
                  </div>
                  <p className="mb-4 text-xs text-slate-300">
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
                <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-white">{priceLabel}</span>
                    {!isFree && (
                      <span className="text-xs text-slate-400">per ticket</span>
                    )}
                  </div>
                  {bigEventMode === "pass" && (
                    <p className="mb-1 text-xs font-semibold text-primary">Full event pass</p>
                  )}
                  <p className="mb-4 text-xs text-slate-300">
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
                <summary className="flex cursor-pointer list-none items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/[0.08] px-4 py-3 text-sm font-bold text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/[0.14]">
                  <CalendarPlus weight="bold" className="h-5 w-5" aria-hidden="true" />
                  Add to calendar
                  <CaretRight
                    weight="bold"
                    className="h-4 w-4 transition-transform duration-200 group-open:rotate-90"
                    aria-hidden="true"
                  />
                </summary>
                <div className="mt-2 flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
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
                          <GoogleLogo weight="bold" className="h-5 w-5 text-slate-300" aria-hidden="true" />
                          Google Calendar
                        </a>
                        <a href={outlookCalendarUrl(cal)} target="_blank" rel="noopener noreferrer" className={item}>
                          <MicrosoftOutlookLogo weight="bold" className="h-5 w-5 text-slate-300" aria-hidden="true" />
                          Outlook
                        </a>
                        <a href={icsDownloadUrl(event.slug)} className={item}>
                          <DownloadSimple weight="bold" className="h-5 w-5 text-slate-300" aria-hidden="true" />
                          Apple / Download .ics
                        </a>
                      </>
                    );
                  })()}
                </div>
              </details>

              {/* Event Info Card */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="mb-4 text-sm font-bold text-white">Event information</h3>
                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="mb-0.5 text-xs text-slate-400">Date</dt>
                    <dd className="font-semibold text-white">{formattedDate}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs text-slate-400">Time</dt>
                    <dd className="font-semibold text-white">{formattedTime}</dd>
                  </div>
                  <div>
                    <dt className="mb-0.5 text-xs text-slate-400">Location</dt>
                    <dd className="font-semibold text-white">{location}</dd>
                  </div>
                </dl>
              </div>

              {/* Organizer Card */}
              {eventSpace && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
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
                        <p className="inline-flex items-center gap-1 text-xs text-slate-400">
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
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
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
                                    backgroundImage: `url(${e.banner_url || e.thumbnail_url || e.image_url})`,
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
                            <p className="text-xs text-slate-400">
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
