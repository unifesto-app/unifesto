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
        <div className="h-64 animate-pulse bg-white/[0.03] md:h-80" />
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
            <h1 className="text-xl font-extrabold text-white">Space not found</h1>
            <p className="mt-1 text-sm text-slate-400">
              This space doesn&apos;t exist or is no longer available.
            </p>
          </div>
          <Link
            href="/spaces"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-shadow duration-200 hover:shadow-[0_0_24px_rgba(52,145,255,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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

      {/* Hero banner */}
      <section
        className="relative mt-20 flex aspect-[4/3] items-end overflow-hidden px-6 pb-8 pt-24 md:mt-24"
        style={
          space.banner_url
            ? { backgroundImage: `url(${space.banner_url})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <div
          aria-hidden
          className={
            space.banner_url
              ? "pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas via-canvas/70 to-canvas/20"
              : "pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_20%_-10%,color-mix(in_srgb,var(--primary)_22%,transparent),transparent_60%)]"
          }
        />

        <div className="relative z-10 mx-auto w-full max-w-5xl">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2 text-xs text-slate-400">
            <Link href="/spaces" className="transition-colors hover:text-white">
              Spaces
            </Link>
            <CaretRight className="h-3 w-3 text-slate-600" aria-hidden />
            {parentSpace && (
              <>
                <Link
                  href={`/space/${parentSpace.slug || parentSpace.id}`}
                  className="max-w-[160px] truncate transition-colors hover:text-white"
                >
                  {parentSpace.name}
                </Link>
                <CaretRight className="h-3 w-3 text-slate-600" aria-hidden />
              </>
            )}
            <span className="max-w-[200px] truncate text-slate-200">{space.name}</span>
          </nav>

          <div className="flex items-end gap-4">
            <SpaceAvatar space={space} size="lg" />
            <div className="min-w-0 flex-1 pb-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {space.is_verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2.5 py-1 text-[11px] font-semibold text-primary ring-1 ring-primary/25">
                    <VerifiedMark className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                {space.name}
              </h1>
              {location && <p className="mt-1 text-sm text-slate-300">{location}</p>}
            </div>
          </div>

          {space.description && (
            <p className="mt-4 max-w-2xl text-pretty text-sm leading-relaxed text-slate-300">{space.description}</p>
          )}

          {/* Join the space in the app; falls back to the store if not installed. */}
          <a
            href={spaceDeepLink}
            onClick={(e) => {
              e.preventDefault();
              openAppOrStore(spaceDeepLink);
            }}
            className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-black transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_24px_color-mix(in_srgb,var(--primary)_40%,transparent)]"
            style={{ background: brandColor ?? brandGradient }}
          >
            <DeviceMobile weight="fill" className="h-5 w-5" aria-hidden="true" />
            Join in the Unifesto app
          </a>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-b border-white/5 bg-canvas">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden px-6 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 py-5">
              <s.icon className="h-5 w-5 text-primary/70" aria-hidden />
              <div>
                <p className="text-xl font-extrabold leading-none text-white">{s.value}</p>
                <p className="mt-1 text-xs text-slate-400">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Parent space */}
        {parentSpace && (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-bold text-slate-300">Part of</h2>
            <Link
              href={`/space/${parentSpace.slug || parentSpace.id}`}
              className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5 transition-colors duration-200 hover:border-primary/30 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <SpaceAvatar space={parentSpace} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-base font-bold text-white">
                  <span className="truncate">{parentSpace.name}</span>
                  {parentSpace.is_verified && <VerifiedMark className="h-3.5 w-3.5" />}
                </p>
              </div>
              <CaretRight className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-primary" aria-hidden />
            </Link>
          </section>
        )}

        {/* Organisers */}
        {organiserList.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-bold text-slate-300">Organisers</h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {organiserList.map((organiser) => (
                <div
                  key={organiser.id}
                  className="flex items-center gap-3.5 rounded-xl border border-white/8 bg-white/[0.02] p-3.5"
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
                    <p className="mt-0.5 text-xs text-slate-400">{organiser.roleLabel}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sub-spaces */}
        {subSpaces.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-300">
              Sub-spaces
              <span className="font-normal text-slate-500">({subSpaces.length})</span>
            </h2>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {subSpaces.map((sub) => (
                <Link
                  key={sub.id}
                  href={`/space/${sub.slug || sub.id}`}
                  className="group flex items-center gap-3.5 rounded-xl border border-white/8 bg-white/[0.02] p-3.5 transition-colors duration-200 hover:border-primary/30 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                  <SpaceAvatar space={sub} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-bold text-white">
                      <span className="truncate">{sub.name}</span>
                      {sub.is_verified && <VerifiedMark className="h-3.5 w-3.5" />}
                    </p>
                  </div>
                  <CaretRight className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-primary" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Events */}
        <section>
          <h2 className="mb-5 flex items-center gap-2 text-sm font-bold text-slate-300">
            Events
            <span className="font-normal text-slate-500">({topLevelEvents.length})</span>
          </h2>

          {topLevelEvents.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {topLevelEvents.map((e, i) => (
                <EventCard key={e.id} event={e} index={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/8 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                <CalendarBlank className="h-6 w-6 text-primary" aria-hidden />
              </div>
              <div>
                <p className="text-base font-bold text-white">No events yet</p>
                <p className="mt-1 text-sm text-slate-400">This space hasn&apos;t published any events.</p>
              </div>
            </div>
          )}
        </section>

        {/* Get in touch — inquiry funnel */}
        <section className="mt-12">
          <div className="mx-auto max-w-xl">
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
