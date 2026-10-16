import { EventSponsor, Sponsor, SponsorTier } from '@prisma/client';

/** An EventSponsor row with the relations the resolver needs loaded. */
export type EventSponsorWithRelations = EventSponsor & {
  sponsor: Sponsor;
  tier: SponsorTier | null;
};

/** The flattened, public-facing shape of a sponsor as it appears at an event. */
export interface EffectiveSponsor {
  eventSponsorId: string;
  sponsorId: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  description: string | null;
  leadCaptureEnabled: boolean;
  order: number;
  tier: { id: string; name: string; rank: number; color: string | null } | null;
}

/**
 * Merge a roster {@link Sponsor} with its per-event {@link EventSponsor}
 * overrides into the single shape public pages (web + mobile) render.
 *
 * Merge rule (product decision, S56): a per-event override that is null, empty
 * or whitespace-only inherits the roster value; anything else replaces it.
 * Tier and website are not overridable today, so they come straight from the
 * attachment / roster.
 */
export function resolveEffectiveSponsor(
  es: EventSponsorWithRelations,
): EffectiveSponsor {
  return {
    eventSponsorId: es.id,
    sponsorId: es.sponsorId,
    name: es.sponsor.name,
    logoUrl: override(es.overrideLogoUrl) ?? es.sponsor.logoUrl,
    description: override(es.overrideDescription) ?? es.sponsor.description,
    websiteUrl: es.sponsor.websiteUrl,
    leadCaptureEnabled: es.leadCaptureEnabled,
    order: es.order,
    tier: es.tier
      ? {
          id: es.tier.id,
          name: es.tier.name,
          rank: es.tier.rank,
          color: es.tier.color,
        }
      : null,
  };
}

/** A blank override means "inherit": null, '' and whitespace-only all count. */
const override = (v: string | null): string | null => (v?.trim() ? v : null);
