/**
 * Public sponsor wall for an event's detail page.
 *
 * Sponsors arrive already flattened to their effective shape and ordered by tier
 * rank then placement (see backend `resolveEffectiveSponsor`). We group them by
 * tier for display — the most prominent tier (lowest rank) first, untiered
 * sponsors last under a generic heading. Display only: the "I'm interested"
 * opt-in lives in the mobile app, where the attendee holds their ticket.
 */

import React from "react";
import type { PublicSponsor } from "@/lib/api/events";

interface EventSponsorsProps {
  sponsors?: PublicSponsor[];
}

interface TierGroup {
  key: string;
  label: string;
  color: string | null;
  rank: number;
  sponsors: PublicSponsor[];
}

function groupByTier(sponsors: PublicSponsor[]): TierGroup[] {
  const groups = new Map<string, TierGroup>();
  for (const s of sponsors) {
    const key = s.tier?.id ?? "__untiered__";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: s.tier?.name ?? "Sponsors",
        color: s.tier?.color ?? null,
        // Untiered sponsors sort to the very end.
        rank: s.tier?.rank ?? Number.MAX_SAFE_INTEGER,
        sponsors: [],
      });
    }
    groups.get(key)!.sponsors.push(s);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank);
}

export default function EventSponsors({ sponsors }: EventSponsorsProps) {
  if (!sponsors || sponsors.length === 0) return null;
  const groups = groupByTier(sponsors);

  return (
    <section aria-labelledby="sponsors-heading">
      <h2 id="sponsors-heading" className="mb-4 text-lg font-bold text-white">
        Sponsors &amp; partners
      </h2>
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.key}>
            <h3
              className="mb-3 text-xs font-semibold uppercase tracking-wide"
              style={{ color: group.color ?? undefined }}
            >
              <span className={group.color ? "" : "text-slate-400"}>
                {group.label}
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {group.sponsors.map((s) => (
                <SponsorCard key={s.event_sponsor_id} sponsor={s} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SponsorCard({ sponsor }: { sponsor: PublicSponsor }) {
  const inner = (
    <div className="flex h-full flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center transition-colors hover:border-white/25 hover:bg-white/10">
      {sponsor.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sponsor.logo_url}
          alt={`${sponsor.name} logo`}
          className="h-14 w-full max-w-[140px] object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex h-14 w-full items-center justify-center rounded-lg bg-white/10 text-base font-bold text-white">
          {sponsor.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-sm font-semibold text-white">{sponsor.name}</span>
      {sponsor.description && (
        <span className="line-clamp-2 text-xs text-slate-400">
          {sponsor.description}
        </span>
      )}
    </div>
  );

  if (sponsor.website_url) {
    return (
      <a
        href={sponsor.website_url}
        target="_blank"
        rel="noopener noreferrer nofollow sponsored"
        className="block h-full"
      >
        {inner}
      </a>
    );
  }
  return inner;
}
