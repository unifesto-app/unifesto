"use client";

import Link from "next/link";
import { useState, useEffect, type CSSProperties } from "react";
import { Buildings, UsersThree, CalendarBlank, CaretRight, ArrowUUpLeft, DeviceMobile } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import LeadCaptureForm from "@/components/LeadCaptureForm";
import { submitSpaceInquiry } from "@/lib/api/leads";
import EventCard from "@/components/EventCard";
import { brandGradient } from "@/lib/styles";
import { openAppOrStore } from "@/lib/appLinks";
import { getSpaceBySlug, getSpaceById, getSpaceEvents, getSubSpaces, type Space } from "@/lib/api/spaces";
import type { SpaceMember } from "@/lib/api/spaces";
import type { Event } from "@/lib/api/events";

interface Props {
  params: Promise<{ spaceSlug: string }>;
}

/* ── Helpers (shared vocabulary with the spaces listing page) ─────────── */

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SpaceAvatar({ space, size = "md" }: { space: Space; size?: "sm" | "md" | "lg" }) {
  const dims = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-10 w-10 text-xs" : "h-12 w-12 text-base";
  const radius = size === "lg" ? "rounded-2xl" : "rounded-xl";

  if (space.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={space.logo_url} alt="" className={`${dims} ${radius} shrink-0 object-cover ring-1 ring-white/10`} />
    );
  }
  return (
    <div
      aria-hidden
      className={`${dims} ${radius} grid shrink-0 place-items-center bg-primary/12 font-extrabold text-primary ring-1 ring-primary/20`}
    >
      {initials(space.name)}
    </div>
  );
}

function VerifiedMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} shrink-0 text-primary`} viewBox="0 0 24 24" fill="currentColor" aria-label="Verified">
      <path d="M12 2 9.6 4.6 6 4l-.6 3.6L2 9.6 4.6 12 2 14.4 5.4 16 6 20l3.6-.6L12 22l2.4-2.6L18 20l.6-3.6L22 14.4 19.4 12 22 9.6 18.4 8 18 4l-3.6.6L12 2Zm-1.2 13.4-3.2-3.2 1.4-1.4 1.8 1.8 4-4 1.4 1.4-5.4 5.4Z" />
    </svg>
  );
}

/* ── Loading skeleton ─────────────────────────────────────────────────── */

function SpaceDetailSkeleton() {
  return (
    <main className="min-h-screen bg-canvas">
      <Navbar />
      <div aria-hidden className="pt-20">
        <div className="h-64 animate-pulse bg-night-2 md:h-80" />
        <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="space-y-2">
              <div className="h-6 w-56 animate-pulse rounded bg-white/[0.06]" />
              <div className="h-3 w-32 animate-pulse rounded bg-white/[0.04]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.04]" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */

export default function SpaceDetailClient({ params }: Props) {
  const [space, setSpace] = useState<Space | null>(null);
  const [parentSpace, setParentSpace] = useState<Space | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [subSpaces, setSubSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSpace = async () => {
      try {
        const { spaceSlug: slug } = await params;
        setLoading(true);

        const spaceData = await getSpaceBySlug(slug);
        if (!spaceData) {
          setSpace(null);
          setLoading(false);
          return;
        }
        setSpace(spaceData);

        // The slug endpoint does not include the organiser team; the by-id
        // endpoint does. Fetch the full space by id (like the mobile app) so we
        // can display Organisers.
        const [eventsData, fullSpaceData, parentSpaceData, subSpacesData] = await Promise.all([
          getSpaceEvents(spaceData.id, 1, 50),
          getSpaceById(spaceData.id),
          spaceData.parent_space_id ? getSpaceById(spaceData.parent_space_id) : Promise.resolve(null),
          getSubSpaces(spaceData.id),
        ]);

        if (fullSpaceData) {
          setSpace({ ...spaceData, organisers: fullSpaceData.organisers });
        }
        setEvents(eventsData?.events || []);
        setParentSpace(parentSpaceData || null);
        setSubSpaces(subSpacesData || []);
        setLoading(false);
      } catch (error) {
        console.error("Error loading space:", error);
        setSpace(null);
        setLoading(false);
      }
    };

    loadSpace();
  }, [params]);

  if (loading) return <SpaceDetailSkeleton />;

  if (!space) {
    return (
      <main className="min-h-screen bg-canvas">
        <Navbar />
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Buildings className="h-7 w-7 text-primary" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-paper">Space not found</h1>
            <p className="mt-1 text-sm text-paper/65">
              This space doesn&apos;t exist or is no longer available.
            </p>
          </div>
          <Link
            href="/spaces"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow duration-200 hover:shadow-[0_0_24px_rgb(var(--glow)/0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <ArrowUUpLeft className="h-4 w-4" aria-hidden />
            Browse spaces
          </Link>
        </div>
      </main>
    );
  }

  // Sub-events live under their parent's hub, so keep them out of the space's
  // event grid — only top-level events are listed here.
  const topLevelEvents = events.filter((e) => !e.parent_event);
  const activeCount = topLevelEvents.filter(
    (e) => e.status === "PUBLISHED",
  ).length;
  const spaceDeepLink = `unifesto://space/${space.slug || space.id}`;
  const location = [space.city, space.state].filter(Boolean).join(", ");
  const subSpaceCount = space.sub_space_count || subSpaces.length;
  const stats = [
    { label: "Events", value: topLevelEvents.length, icon: CalendarBlank },
    { label: "Active", value: activeCount, icon: CalendarBlank },
    { label: "Members", value: (space.member_count || 0).toLocaleString(), icon: UsersThree },
    ...(subSpaceCount > 0
      ? [{ label: "Sub-spaces", value: subSpaceCount, icon: Buildings }]
      : []),
  ];

  // Organisers (based on actual organiser roles for this space) — mirrors the
  // mobile app derivation in SpaceDetailScreen.tsx.
  const organiserList: { id: string; name: string; avatarUrl: string | null; roleLabel: string }[] = [];
  (space.organisers ?? []).forEach((member: SpaceMember) => {
    if (organiserList.some((o) => o.id === member.user.id)) return;
    const code = member.role?.code?.toUpperCase();
    const roleLabel =
      code === "ORGANISER" || code === "ORGANIZER" || code === "SUPER_ORGANISER"
        ? "Organiser"
        : "Co-Organiser";
    organiserList.push({
      id: member.user.id,
      name: member.user.fullName || member.user.username || "Organiser",
      avatarUrl: member.user.avatarUrl,
      roleLabel,
    });
  });

  // White-label: recolour the page to the organiser's accent by overriding the
  // `--primary`/`--accent` CSS variables on this wrapper only (every
  // `text-primary`/`bg-primary` element maps to them). `branding` is null for
  // non-white-labelled spaces, leaving the default Unifesto look untouched.
  const brandColor = space.branding?.color || undefined;
  const brandStyle = brandColor
    ? ({ "--primary": brandColor, "--accent": brandColor } as CSSProperties)
    : undefined;

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-canvas"
      style={brandStyle}
    >
      <Navbar />

      {/* Hero: compact 4:3 banner beside the identity (never cropped, text
          beside it rather than over it). Stacks on small screens. */}
      <section className="px-5 pb-6 pt-28 sm:px-8 md:pt-32">
        <div className="mx-auto grid max-w-6xl items-center gap-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-12">
          <div
            className="enter aspect-[4/3] w-full overflow-hidden rounded-3xl bg-night-2 bg-cover bg-center shadow-[0_32px_64px_-32px_rgba(0,0,0,0.6)]"
            style={
              space.banner_url
                ? { backgroundImage: `url(${space.banner_url})` }
                : { background: "radial-gradient(120% 120% at 20% -10%, color-mix(in srgb, var(--primary) 26%, transparent), transparent 60%), var(--night-2)" }
            }
            role={space.banner_url ? "img" : undefined}
            aria-label={space.banner_url ? `${space.name} banner` : undefined}
          />
          <div>
            <nav aria-label="Breadcrumb" className="enter mb-6 flex items-center gap-2 text-xs text-paper/60">
              <Link href="/spaces" className="link-draw transition-colors duration-150 hover:text-paper">
                Spaces
              </Link>
              <CaretRight className="h-3 w-3" aria-hidden />
              {parentSpace && (
                <>
                  <Link
                    href={`/space/${parentSpace.slug || parentSpace.id}`}
                    className="link-draw max-w-[160px] truncate transition-colors duration-150 hover:text-paper"
                  >
                    {parentSpace.name}
                  </Link>
                  <CaretRight className="h-3 w-3" aria-hidden />
                </>
              )}
              <span className="max-w-[200px] truncate text-paper/85">{space.name}</span>
            </nav>

            <div className="enter flex items-center gap-4" style={{ ["--d" as string]: "80ms" }}>
              <SpaceAvatar space={space} size="lg" />
              {space.is_verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <VerifiedMark className="h-3.5 w-3.5" />
                  Verified
                </span>
              )}
            </div>
            <h1
              className="waterline-load mt-5 font-display text-[clamp(1.9rem,4.2vw,3.1rem)] font-bold leading-[1.04] text-paper [text-wrap:balance]"
              style={{ letterSpacing: "-0.035em" }}
            >
              <span className="line">
                <span className="line-inner">{space.name}</span>
              </span>
            </h1>
            {location && (
              <p className="enter mt-2 text-sm text-paper/65" style={{ ["--d" as string]: "200ms" }}>
                {location}
              </p>
            )}
            {space.description && (
              <p className="enter mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-paper/75" style={{ ["--d" as string]: "260ms" }}>
                {space.description}
              </p>
            )}
            <a
              href={spaceDeepLink}
              onClick={(e) => {
                e.preventDefault();
                openAppOrStore(spaceDeepLink);
              }}
              className="enter btn btn-lg btn-primary mt-7"
              style={{ ["--d" as string]: "340ms", ...(brandColor ? { background: brandColor } : {}) }}
            >
              <DeviceMobile weight="fill" className="h-5 w-5" aria-hidden="true" />
              Join in the Unifesto app
            </a>
          </div>
        </div>
      </section>

      {/* Stats: a quiet row of solid tiles. */}
      <div className="px-5 sm:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-2 sm:grid-cols-4" data-stagger="rise">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl bg-night-2 p-5">
              <s.icon className="h-5 w-5 text-primary" aria-hidden />
              <div>
                <p className="tabular font-display text-xl font-bold leading-none text-paper">{s.value}</p>
                <p className="mt-1 text-xs text-paper/60">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pb-20 pt-12 sm:px-8">
        {/* Parent space */}
        {parentSpace && (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-bold text-paper/75">Part of</h2>
            <Link
              href={`/space/${parentSpace.slug || parentSpace.id}`}
              className="group flex items-center gap-4 rounded-3xl bg-night-2 p-6 transition-colors duration-150 hover:bg-night-3"
            >
              <SpaceAvatar space={parentSpace} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-base font-bold text-white">
                  <span className="truncate">{parentSpace.name}</span>
                  {parentSpace.is_verified && <VerifiedMark className="h-3.5 w-3.5" />}
                </p>
              </div>
              <CaretRight className="h-4 w-4 shrink-0 text-paper/55 transition-colors group-hover:text-primary" aria-hidden />
            </Link>
          </section>
        )}

        {/* Organisers */}
        {organiserList.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-bold text-paper/75">Organisers</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {organiserList.map((organiser) => (
                <div
                  key={organiser.id}
                  className="flex items-center gap-3.5 rounded-2xl bg-night-2 p-4"
                >
                  {organiser.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={organiser.avatarUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-white/10"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/12 text-base font-extrabold text-primary ring-1 ring-primary/20"
                    >
                      {organiser.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{organiser.name}</p>
                    <p className="mt-0.5 text-xs text-paper/65">{organiser.roleLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sub-spaces */}
        {subSpaces.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-paper/75">
              Sub-spaces
              <span className="font-normal text-paper/55">({subSpaces.length})</span>
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {subSpaces.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/space/${sub.slug || sub.id}`}
                  className="group flex items-center gap-3.5 rounded-2xl bg-night-2 p-4 transition-colors duration-150 hover:bg-night-3"
                >
                  <SpaceAvatar space={sub} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-bold text-white">
                      <span className="truncate">{sub.name}</span>
                      {sub.is_verified && <VerifiedMark className="h-3.5 w-3.5" />}
                    </p>
                  </div>
                  <CaretRight className="h-4 w-4 shrink-0 text-paper/55 transition-colors group-hover:text-primary" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Events */}
        <section>
          <h2 className="mb-5 flex items-center gap-2 text-sm font-bold text-paper/75">
            Events
            <span className="font-normal text-paper/55">({topLevelEvents.length})</span>
          </h2>

          {topLevelEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {topLevelEvents.map((e, i) => (
                <EventCard key={e.id} event={e} index={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-night-2 px-6 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <CalendarBlank className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-base font-bold text-white">No events yet</p>
                <p className="mt-1 text-sm text-paper/65">This space hasn&apos;t published any events.</p>
              </div>
            </div>
          )}
        </section>

        {/* Get in touch — inquiry funnel */}
        <section className="mt-12">
          <div>
            <LeadCaptureForm
              title={`Get in touch with ${space.name}`}
              description="Have a question, a partnership idea, or want to sponsor? Send a note and the team will reach out."
              cta="Send inquiry"
              successText="Thanks — your inquiry has been sent."
              withMessage
              onSubmit={(body) => submitSpaceInquiry(space.id, body)}
            />
          </div>
        </section>
      </div>

      <Footer />
    </main>
  );
}
