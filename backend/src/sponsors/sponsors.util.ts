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
 * The merge rule is a real product decision, which is why it lives in one place:
 * a per-event override field that is `null` means "inherit the roster default";
 * a non-null value (including an empty string, if we ever allow one) means
 * "use this instead". Tier and website are not overridable today, so they come
 * straight from the attachment / roster.
 *
 * TODO(you): confirm the inheritance semantics you want here. Options to weigh:
 *   - null  -> inherit (current default)
 *   - ''    -> should an empty override blank the field, or also inherit?
 *   - trimming/whitespace-only overrides -> treat as inherit?
 * Adjust the two `??` lines below to encode the rule you choose.
 */
export function resolveEffectiveSponsor(
  es: EventSponsorWithRelations,
): EffectiveSponsor {
  return {
    eventSponsorId: es.id,
    sponsorId: es.sponsorId,
    name: es.sponsor.name,
    logoUrl: es.overrideLogoUrl ?? es.sponsor.logoUrl,
    description: es.overrideDescription ?? es.sponsor.description,
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
