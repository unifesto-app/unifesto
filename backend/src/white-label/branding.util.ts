/**
 * Attendee-facing white-label theme for a space and the events under it.
 *
 * `null` means "no white-label, show default Unifesto branding". A space's
 * theme is live only when ALL of these hold:
 *   1. a curator switched it on (`whiteLabelEnabled`, self-serve),
 *   2. the space's plan still includes `hasRemoveBranding`,
 *   3. a platform admin hasn't suspended it (`brandingSuspendedAt`).
 *
 * Gates 2 and 3 live in the render path on purpose: a downgrade or a suspension
 * takes the branding down everywhere without touching the stored theme, and
 * lifting it brings the same theme back.
 */

/** Font presets a space can pick. Key is stored, value is the Google Fonts family. */
export const BRAND_FONTS = {
  inter: 'Inter',
  'dm-sans': 'DM Sans',
  'space-grotesk': 'Space Grotesk',
  poppins: 'Poppins',
  montserrat: 'Montserrat',
  'ibm-plex-sans': 'IBM Plex Sans',
  'playfair-display': 'Playfair Display',
  lora: 'Lora',
} as const;
export type BrandFont = keyof typeof BRAND_FONTS;

export const BRAND_MODES = ['light', 'dark'] as const;
export type BrandMode = (typeof BRAND_MODES)[number];

export interface Branding {
  /**
   * Space name for the branded header. Null when only an event colour
   * override applies, which also tells clients to keep Unifesto's chrome.
   */
  name: string | null;
  /** Accent colour (hex, e.g. `#7A5AF8`). */
  color: string | null;
  /** Header logo: the wide brand wordmark, else the square space logo. */
  logoUrl: string | null;
  /** True when `logoUrl` is the square space-logo fallback, not a wide wordmark. */
  logoSquare: boolean;
  /** Google Fonts family name, or null for Unifesto's font. */
  font: string | null;
  /** Forced page theme, or null to respect the visitor's choice. */
  mode: BrandMode | null;
  /** Drop "Powered by Unifesto" from branded pages and emails. */
  hidePoweredBy: boolean;
  /** Tab icon. */
  faviconUrl: string | null;
  /** Verified custom web domain (e.g. `events.acme.edu`), the space's canonical home. */
  customDomain: string | null;
}

/** Space columns every branding resolver needs. Spread into a Prisma `select`. */
export const BRANDING_SPACE_SELECT = {
  name: true,
  logoUrl: true,
  whiteLabelEnabled: true,
  brandingSuspendedAt: true,
  brandColor: true,
  brandLogoUrl: true,
  brandFont: true,
  brandMode: true,
  hidePoweredBy: true,
  faviconUrl: true,
  emailFromName: true,
  emailReplyTo: true,
  // Verified custom web domain only (one per space).
  domains: { where: { kind: 'WEB', status: 'verified' }, select: { hostname: true } },
} as const;

export interface BrandSpace {
  name: string;
  logoUrl: string | null;
  whiteLabelEnabled: boolean;
  brandingSuspendedAt: Date | null;
  brandColor: string | null;
  brandLogoUrl: string | null;
  brandFont: string | null;
  brandMode: string | null;
  hidePoweredBy: boolean;
  faviconUrl: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
  /** From BRANDING_SPACE_SELECT; callers that skip it get no custom domain. */
  domains?: { hostname: string }[];
}

export function isSpaceBrandingLive(
  space: Pick<BrandSpace, 'whiteLabelEnabled' | 'brandingSuspendedAt'> | null | undefined,
  hasRemoveBranding: boolean,
): boolean {
  return !!space && space.whiteLabelEnabled && !space.brandingSuspendedAt && hasRemoveBranding;
}

export function resolveSpaceBranding(
  space: BrandSpace | null | undefined,
  hasRemoveBranding: boolean,
): Branding | null {
  if (!space || !isSpaceBrandingLive(space, hasRemoveBranding)) return null;
  return {
    name: space.name,
    color: space.brandColor ?? null,
    logoUrl: space.brandLogoUrl ?? space.logoUrl ?? null,
    logoSquare: !space.brandLogoUrl && !!space.logoUrl,
    font: BRAND_FONTS[space.brandFont as BrandFont] ?? null,
    mode: BRAND_MODES.includes(space.brandMode as BrandMode) ? (space.brandMode as BrandMode) : null,
    hidePoweredBy: space.hidePoweredBy,
    faviconUrl: space.faviconUrl ?? null,
    customDomain: space.domains?.[0]?.hostname ?? null,
  };
}

/**
 * An event wears its space's theme. It may override only the accent colour
 * (its own `whiteLabelEnabled` + `brandColor`), which works even when the
 * space theme itself is off, as long as the plan allows it and the space
 * isn't suspended.
 */
export function resolveEventBranding(
  event: { whiteLabelEnabled: boolean; brandColor: string | null },
  space: BrandSpace | null | undefined,
  hasRemoveBranding: boolean,
): Branding | null {
  const base = resolveSpaceBranding(space, hasRemoveBranding);
  const override =
    hasRemoveBranding && !space?.brandingSuspendedAt && event.whiteLabelEnabled
      ? event.brandColor
      : null;
  if (!override) return base;
  return {
    ...(base ?? { name: null, logoUrl: null, logoSquare: false, font: null, mode: null, hidePoweredBy: false, faviconUrl: null, customDomain: null }),
    color: override,
  };
}

/** Attendee-email sender identity (from-name + reply-to), or null when branding is off. */
export function resolveEmailSender(
  space: BrandSpace | null | undefined,
  hasRemoveBranding: boolean,
): { emailFromName: string | null; emailReplyTo: string | null } | null {
  if (!space || !isSpaceBrandingLive(space, hasRemoveBranding)) return null;
  return { emailFromName: space.emailFromName ?? null, emailReplyTo: space.emailReplyTo ?? null };
}
