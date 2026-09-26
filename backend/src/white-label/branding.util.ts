/**
 * Attendee-facing branding (accent colour) for a white-labelled space or event.
 *
 * `null` means "no white-label — show default Unifesto branding". A non-null
 * value is only produced when BOTH gates pass:
 *   1. the entity's `whiteLabelEnabled` flag is on (admin-approved), AND
 *   2. the owning space's plan still includes `hasRemoveBranding`.
 *
 * Keeping gate (2) in the render path is deliberate: if a space downgrades to a
 * plan without the perk, its branding disappears automatically without anyone
 * having to touch the `whiteLabelEnabled` flag or the WhiteLabelRequest rows.
 */
export interface Branding {
  /** Accent colour (hex, e.g. `#7A5AF8`). White-label is colour-only. */
  color: string | null;
}

interface BrandableEntity {
  whiteLabelEnabled: boolean;
  brandColor: string | null;
}

export function resolveBranding(
  entity: BrandableEntity | null | undefined,
  hasRemoveBranding: boolean,
): Branding | null {
  if (!entity || !entity.whiteLabelEnabled || !hasRemoveBranding) return null;
  return { color: entity.brandColor ?? null };
}

/**
 * Space-level white-label surfaces beyond the accent colour: the public
 * favicon and the confirmation-email sender identity. These live on the space
 * (not per-event), so an event page shows its owning space's favicon. Gated by
 * the same two checks as `resolveBranding` — a space that never got white-label
 * approval, or dropped the plan perk, gets `null` for every surface.
 */
export interface SpaceSurfaces {
  /** Tab icon for public space/event pages. */
  faviconUrl: string | null;
  /** Display name for confirmation emails (sending address is unchanged). */
  emailFromName: string | null;
  /** Reply-To address so attendee replies reach the organiser. */
  emailReplyTo: string | null;
}

interface WhiteLabelSpace {
  whiteLabelEnabled: boolean;
  faviconUrl: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
}

export function resolveSpaceSurfaces(
  space: WhiteLabelSpace | null | undefined,
  hasRemoveBranding: boolean,
): SpaceSurfaces | null {
  if (!space || !space.whiteLabelEnabled || !hasRemoveBranding) return null;
  return {
    faviconUrl: space.faviconUrl ?? null,
    emailFromName: space.emailFromName ?? null,
    emailReplyTo: space.emailReplyTo ?? null,
  };
}
