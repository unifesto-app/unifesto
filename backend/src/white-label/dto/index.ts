import {
  IsBoolean,
  IsHexColor,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
} from 'class-validator';

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
 * Post-approval tweak of the accent colour on an already-white-labelled target. The
 * admin has already blessed white-label for the entity, so colour/logo changes
 * doesn't need re-approval — but the plan gate is still enforced server-side.
 */
export class UpdateBrandingDto {
  @IsOptional()
  @IsHexColor()
  brandColor?: string;

  // Space-level surfaces (ignored on an event target). All take effect only
  // while the space's white-label is enabled and the plan carries the perk.
  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emailFromName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  emailReplyTo?: string;
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
