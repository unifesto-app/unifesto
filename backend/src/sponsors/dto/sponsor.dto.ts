import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

// ---- Tiers ----------------------------------------------------------------

/** Create a rung on the space's sponsorship ladder (Platinum, Gold, ...). */
export class CreateSponsorTierDto {
  @ApiProperty() @IsString() @MaxLength(100) name: string;

  @ApiPropertyOptional({ description: '0 = most prominent tier' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rank?: number;

  @ApiPropertyOptional({ description: 'Accent colour, e.g. #C0C0C0' })
  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateSponsorTierDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) rank?: number;
  @ApiPropertyOptional() @IsOptional() @IsHexColor() color?: string;
}

// ---- Roster sponsors ------------------------------------------------------

/** Create a sponsor in the space's reusable roster. */
export class CreateSponsorDto {
  @ApiProperty() @IsString() @MaxLength(255) name: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
}

export class UpdateSponsorDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() websiteUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(255) contactEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
}

// ---- Attaching a sponsor to an event --------------------------------------

/** Attach a roster sponsor to an event, with per-event overrides. */
export class AttachSponsorDto {
  @ApiProperty() @IsUUID() sponsorId: string;

  @ApiPropertyOptional({ description: 'Tier for this event (roster tier id)' })
  @IsOptional()
  @IsUUID()
  tierId?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;

  @ApiPropertyOptional({ description: 'Allow attendee lead capture at this event' })
  @IsOptional()
  @IsBoolean()
  leadCaptureEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Per-event logo override (null = inherit)' })
  @IsOptional()
  @IsUrl()
  overrideLogoUrl?: string;

  @ApiPropertyOptional({ description: 'Per-event description override (null = inherit)' })
  @IsOptional()
  @IsString()
  overrideDescription?: string;
}

// ---- Sponsor portal access (P5) -------------------------------------------

/** Invite a person (by the email on their Unifesto account) to a sponsor. */
export class InviteSponsorUserDto {
  @ApiProperty() @IsEmail() @MaxLength(255) email: string;
}

/** Booth scan: link an attendee's ticket QR to a sponsor at an event. */
export class BoothScanDto {
  @ApiProperty() @IsUUID() eventSponsorId: string;
  @ApiProperty() @IsString() @MaxLength(200) qrCode: string;
}

/** Patch an existing event-sponsor attachment (all fields optional). */
export class UpdateEventSponsorDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() tierId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) order?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() leadCaptureEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() overrideLogoUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() overrideDescription?: string | null;
}
