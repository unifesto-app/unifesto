"use client";

import { optimized } from "@/lib/img";
import Link from "next/link";
import { useState, useEffect } from "react";
import { ArrowUpRight, CalendarBlank, CaretRight, DeviceMobile, Globe, SealCheck, UsersThree } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { BrandFooter, BrandHeader, BrandTheme, brandStyle, hasBrandedChrome } from "@/components/BrandedChrome";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import EventCard from "@/components/EventCard";
import EventCardSkeleton from "@/components/EventCardSkeleton";
import { ActionBar, Avatar, Block, Card, FactRow, Rail, ReadMore } from "@/components/DetailParts";
import { submitSpaceInquiry } from "@/lib/api/leads";
import { openAppOrStore } from "@/lib/appLinks";
import { getSpaceBySlug, getSpaceById, getSpaceEvents, getSubSpaces, type Space } from "@/lib/api/spaces";
import type { Event } from "@/lib/api/events";

interface Props {
  params: Promise<{ spaceSlug: string }>;
  /** Fetched by the server page; lets the hero render in the initial HTML. */
  initialSpace?: Space | null;
}

/** Past events shown in the rail (as on mobile). */
const PAST_LIMIT = 12;

/** 1.2k-style counts so three stats fit one row. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

function isPast(e: Event, now: number): boolean {
  const s = e.status?.toUpperCase();
  return s === "COMPLETED" || s === "CANCELLED" || new Date(e.end_date || e.start_date).getTime() < now;
}

/* ── Loading skeleton ─────────────────────────────────────────────────── */

function SpaceDetailSkeleton() {
  return (
    <main className="min-h-screen bg-canvas">
      <Navbar />
      <div aria-hidden className="mx-auto grid max-w-5xl gap-8 px-5 pt-28 sm:px-8 md:grid-cols-2 md:pt-32">
        <div className="aspect-[4/3] w-full animate-pulse rounded-3xl bg-night-2" />
        <div className="space-y-4">
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-paper/[0.06]" />
          <div className="h-8 w-2/3 animate-pulse rounded-lg bg-paper/[0.05]" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-paper/[0.05]" />
          <div className="h-24 w-full animate-pulse rounded-3xl bg-paper/[0.05]" />
        </div>
      </div>
    </main>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function SpaceDetailClient({ params, initialSpace = null }: Props) {
  const [space, setSpace] = useState<Space | null>(initialSpace);
  const [parentSpace, setParentSpace] = useState<Space | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [subSpaces, setSubSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(!initialSpace);
  // Events/sub-spaces arrive after the hero is already on screen.
  const [detailsLoading, setDetailsLoading] = useState(true);
  // Captured once so render stays pure; splits upcoming from past.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const loadSpace = async () => {
      try {
        const { spaceSlug: slug } = await params;

        const spaceData = initialSpace ?? (await getSpaceBySlug(slug));
        if (!spaceData) {
          setSpace(null);
          setLoading(false);
          return;
        }
        setSpace(spaceData);
        // Show the page now rather than holding it (and its LCP) behind the
        // detail requests below.
        setLoading(false);

        const [eventsData, parentSpaceData, subSpacesData] = await Promise.all([
          getSpaceEvents(spaceData.id, 1, 50),
          spaceData.parent_space_id ? getSpaceById(spaceData.parent_space_id) : Promise.resolve(null),
          getSubSpaces(spaceData.id),
        ]);

        setEvents(eventsData?.events || []);
        setParentSpace(parentSpaceData || null);
        setSubSpaces(subSpacesData || []);
      } catch (error) {
        console.error("Error loading space:", error);
        // A failed side fetch must not blank a space we already have.
        if (!initialSpace) setSpace(null);
        setLoading(false);
      } finally {
        setDetailsLoading(false);
      }
    };

    loadSpace();
  }, [params, initialSpace]);

  if (loading) return <SpaceDetailSkeleton />;

  if (!space) {
    return (
      <main className="flex min-h-screen flex-col bg-canvas">
        <Navbar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <UsersThree className="h-12 w-12 text-paper/45" aria-hidden />
          <h1 className="font-display text-2xl text-paper">Space not found</h1>
          <p className="text-sm text-paper/65">This space doesn&apos;t exist or is no longer available.</p>
          <Link href="/spaces" className="btn btn-lg btn-secondary mt-2">
            Browse spaces
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  // Sub-events live under their parent's page, so only top-level events here.
  const topLevel = events.filter((e) => !e.parent_event);
  const upcoming = topLevel
    .filter((e) => !isPast(e, now))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = topLevel
    .filter((e) => isPast(e, now))
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const eventCount = topLevel.length;
  const memberCount = space.member_count || 0;

  const spaceDeepLink = `unifesto://space/${space.slug || space.id}`;
  const meta = [space.city, space.state].filter(Boolean).join(", ");
  const description = space.description?.trim();
  const websiteUrl = space.website
    ? /^https?:\/\//i.test(space.website) ? space.website : `https://${space.website}`
    : null;
  const websiteLabel = space.website?.replace(/^https?:\/\//i, "").replace(/\/$/, "") ?? null;
  const stats = [
    { label: memberCount === 1 ? "Member" : "Members", value: memberCount, ready: true },
    { label: "Upcoming", value: upcoming.length, ready: !detailsLoading },
    { label: eventCount === 1 ? "Event hosted" : "Events hosted", value: eventCount, ready: !detailsLoading },
  ];

  // White-label: theme the wrapper; a live space theme also swaps the chrome.
  const branded = hasBrandedChrome(space.branding) ? space.branding : null;

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas pb-24" style={brandStyle(space.branding)}>
      <BrandTheme branding={space.branding} />
      {branded ? <BrandHeader branding={branded} href={`/space/${space.slug}`} /> : <Navbar />}

      {/* ── Hero: 4:3 banner beside the 1:1 logo, name and stats ── */}
      <section className="px-5 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto grid max-w-5xl items-start gap-8 md:grid-cols-2 md:gap-12">
          <div
            className="enter aspect-[4/3] w-full overflow-hidden rounded-3xl bg-night-2 bg-cover bg-center"
            style={
              space.banner_url
                ? { backgroundImage: `url(${optimized(space.banner_url)})` }
                : { background: "radial-gradient(120% 120% at 20% -10%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 60%), var(--night-2)" }
            }
            role={space.banner_url ? "img" : undefined}
            aria-label={space.banner_url ? `${space.name} banner` : undefined}
          />

          <div>
            <div className="enter">
              <Avatar src={space.logo_url} name={space.name} size={76} />
            </div>
            <h1 className="waterline-load mt-5 font-display text-[clamp(1.6rem,3.6vw,2.6rem)] leading-[1.15] text-paper [text-wrap:balance]">
              <span className="line">
                <span className="line-inner">
                  {space.name}
                  {space.is_verified && (
                    <SealCheck
                      weight="fill"
                      className="ml-2 inline h-[0.8em] w-[0.8em] align-[-0.05em] text-primary"
                      aria-label="Verified"
                    />
                  )}
                </span>
              </span>
            </h1>
            {meta && <p className="enter mt-2 text-sm text-paper/65">{meta}</p>}

            {parentSpace && (
              <Link
                href={`/space/${parentSpace.slug || parentSpace.id}`}
                className="enter mt-3 inline-flex max-w-full items-center gap-1 text-sm text-paper/55 transition-colors hover:text-paper"
              >
                <span className="truncate">
                  Part of <span className="font-semibold text-paper">{parentSpace.name}</span>
                </span>
                <CaretRight className="h-3 w-3 shrink-0" aria-hidden />
              </Link>
            )}

            {/* ── Stats card: numbers, then the website ── */}
            <Card className="enter mt-6">
              <div className="flex px-2 py-5">
                {stats.map((st) => (
                  <div key={st.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="tabular font-display text-xl leading-7 text-paper">
                      {st.ready ? compact(st.value) : "–"}
                    </span>
                    <span className="truncate text-xs text-paper/55">{st.label}</span>
                  </div>
                ))}
              </div>
              {websiteUrl && websiteLabel && (
                <div className="border-t border-paper/10">
                  <FactRow
                    icon={<Globe className="h-6 w-6 text-paper" aria-hidden />}
                    title={websiteLabel}
                    href={websiteUrl}
                    external
                    trailing={<ArrowUpRight className="h-4 w-4 shrink-0 text-paper/45" aria-hidden />}
                  />
                </div>
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

        {detailsLoading ? (
          <Block title="Upcoming">
            <Rail>
              {Array.from({ length: 3 }).map((_, i) => (
                <EventCardSkeleton key={i} />
              ))}
            </Rail>
          </Block>
        ) : (
          <>
            {upcoming.length > 0 && (
              <Block title="Upcoming" subtitle={`${upcoming.length} coming up`}>
                <Rail>
                  {upcoming.map((e, i) => (
                    <EventCard key={e.id} event={e} index={i} />
                  ))}
                </Rail>
              </Block>
            )}

            {eventCount === 0 && (
              <Block title="Events">
                <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <CalendarBlank className="h-8 w-8 text-paper/45" aria-hidden />
                  <p className="text-sm text-paper/65">No events yet. Check back soon.</p>
                </Card>
              </Block>
            )}
          </>
        )}

        {subSpaces.length > 0 && (
          <Block title="Sub-spaces" subtitle={`${subSpaces.length} inside ${space.name}`}>
            <Rail>
              {subSpaces.map((sub) => (
                <Link key={sub.id} href={`/space/${sub.slug || sub.id}`} className="group block">
                  <div
                    className="aspect-[4/3] w-full rounded-3xl bg-night-2 bg-cover bg-center transition-opacity group-hover:opacity-90"
                    style={sub.banner_url ? { backgroundImage: `url(${optimized(sub.banner_url, 640)})` } : undefined}
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar src={sub.logo_url} name={sub.name} size={32} />
                    <p className="truncate text-[15px] font-semibold text-paper">{sub.name}</p>
                  </div>
                </Link>
              ))}
            </Rail>
          </Block>
        )}

        {!detailsLoading && past.length > 0 && (
          <Block title="Past events" subtitle={`${past.length} hosted`}>
            <Rail>
              {past.slice(0, PAST_LIMIT).map((e, i) => (
                <div key={e.id} className="opacity-60 transition-opacity hover:opacity-100">
                  <EventCard event={e} index={i} />
                </div>
              ))}
            </Rail>
          </Block>
        )}

        {/* Get in touch: inquiry funnel for partners and sponsors (web only). */}
        <section className="mt-14">
          <LeadCaptureForm
            title={`Get in touch with ${space.name}`}
            description="Have a question, a partnership idea, or want to sponsor? Send a note and the team will reach out."
            cta="Send inquiry"
            successText="Thanks, your inquiry has been sent."
            withMessage
            onSubmit={(body) => submitSpaceInquiry(space.id, body)}
          />
        </section>

        {!space.is_verified && (
          <p className="mt-10 max-w-2xl text-xs leading-5 text-paper/45">
            This space is run by its members. Unifesto has not verified that it is affiliated with or endorsed by any
            organisation it names. Represent that organisation?{" "}
            <Link href="/grievance#organisations" className="underline hover:text-paper">
              Let us know
            </Link>
            .
          </p>
        )}
      </div>

      {branded ? <BrandFooter branding={branded} /> : <Footer />}

      <ActionBar label={memberCount === 1 ? "Member" : "Members"} value={memberCount.toLocaleString("en-IN")}>
        <a
          href={spaceDeepLink}
          onClick={(e) => {
            e.preventDefault();
            openAppOrStore(spaceDeepLink);
          }}
          className="btn btn-lg btn-primary shrink-0"
        >
          <DeviceMobile weight="fill" className="h-5 w-5" aria-hidden />
          Join
        </a>
      </ActionBar>
    </main>
  );
}
