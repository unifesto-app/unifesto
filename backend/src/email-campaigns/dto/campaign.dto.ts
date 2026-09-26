import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmailTargetType } from '@prisma/client';

/**
 * Segment filters for the SEGMENT target type (platform-only). Each field
 * narrows the recipient set; omitted fields impose no constraint. Kept as a
 * typed DTO (not free-form JSON) so the where-clause builder in
 * EmailCampaignsService can trust its shape.
 */
export class SegmentFiltersDto {
  /** Space plan codes; matches users who are members of a space on that plan. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  plan?: string[];

  @IsOptional()
  @IsISO8601()
  joinedAfter?: string;

  @IsOptional()
  @IsISO8601()
  joinedBefore?: string;

  @IsOptional()
  @IsBoolean()
  hasRegistrations?: boolean;
}

/**
 * Compose (and optionally schedule) a campaign. Shared by the platform and
 * space controllers; the space controller injects `spaceId` from the route and
 * rejects platform-only target types, so this DTO carries no spaceId itself.
 */
export class CreateCampaignDto {
  @IsEnum(EmailTargetType)
  targetType!: EmailTargetType;

  /** eventId (EVENT_REGISTRANTS / WAITLIST) or userId (SINGLE_USER). */
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @IsString()
  @MaxLength(500)
  subject!: string;

  /** A/B variant B subject. When set, `abSplitPct` governs the split. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subjectB?: string;

  /** Percentage (0-100) of recipients that receive variant A. Default 50. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  abSplitPct?: number;

  /** HTML body. May contain {{mergeVars}} and <a href> links to be tracked. */
  @IsString()
  body!: string;

  /** Template this body was composed from (advisory; body is snapshotted). */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentFiltersDto)
  segmentFilters?: SegmentFiltersDto;

  /** ISO timestamp to send at. Omit to send immediately. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  /** Wrap the body in the branded Unifesto shell. Default true. */
  @IsOptional()
  @IsBoolean()
  wrap?: boolean;
}

/** Render `body` with sample merge values — powers the composer's live preview. */
export class PreviewCampaignDto {
  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;
}
