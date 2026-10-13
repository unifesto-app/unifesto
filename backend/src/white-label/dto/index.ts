import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BRAND_FONTS, BRAND_MODES } from '../branding.util';

/**
 * Organiser asks an admin to white-label a space, or one of its events.
 * `eventId` omitted = space-level; set = event-level (must belong to `spaceId`).
 */
export class CreateWhiteLabelRequestDto {
  @IsUUID()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsHexColor()
  brandColor: string;

  @IsString()
  @MaxLength(1000)
  reason: string;
}

export class ReviewWhiteLabelRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

/**
 * Branding studio patch. Every field is optional; `null` clears a column,
 * omitted leaves it. On an event target only `brandColor` applies (the event's
 * accent override); the rest are space-level.
 */
export class UpdateBrandingDto {
  /** Space only: switch the theme on/off. */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsHexColor()
  brandColor?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  brandLogoUrl?: string | null;

  @IsOptional()
  @IsIn(Object.keys(BRAND_FONTS))
  brandFont?: string | null;

  @IsOptional()
  @IsIn(BRAND_MODES)
  brandMode?: string | null;

  @IsOptional()
  @IsBoolean()
  hidePoweredBy?: boolean;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  faviconUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emailFromName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  emailReplyTo?: string | null;
}

export class SuspendBrandingDto {
  @IsBoolean()
  suspended: boolean;
}

/**
 * Admin directly applies (or removes) white-label on a space or event, skipping
 * the organiser request/approval round-trip. `enabled` flips the target's
 * `whiteLabelEnabled` flag; the colour is patched when provided. The plan gate
 * is NOT enforced here on write — an admin may enable it ahead of a plan — but
 * `resolveBranding` still requires the plan at render time, so the branding only
 * goes live once the owning space's plan includes the perk.
 */
export class AdminApplyBrandingDto {
  @IsBoolean()
  enabled: boolean;

  // `null` explicitly clears the accent colour (falls back to the default
  // theme); `undefined`/omitted leaves it untouched. `@IsOptional` lets null
  // through, skipping the hex check.
  @IsOptional()
  @IsHexColor()
  brandColor?: string | null;
}
