import {
  Equals,
  IsBoolean,
  IsEmail,
  IsHexColor,
  IsIn,
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
  @IsString() @MaxLength(100) name: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rank?: number;

  @IsOptional()
  @IsHexColor()
  color?: string;
}

export class UpdateSponsorTierDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsInt() @Min(0) rank?: number;
  @IsOptional() @IsHexColor() color?: string;
}

// ---- Roster sponsors ------------------------------------------------------

/** Create a sponsor in the space's reusable roster. */
export class CreateSponsorDto {
  @IsString() @MaxLength(255) name: string;

  @IsOptional() @IsUrl() logoUrl?: string;
  @IsOptional() @IsUrl() websiteUrl?: string;
  @IsOptional() @IsString() description?: string;

  @IsOptional() @IsString() @MaxLength(255) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
}

export class UpdateSponsorDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsUrl() logoUrl?: string;
  @IsOptional() @IsUrl() websiteUrl?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(255) contactName?: string;
  @IsOptional() @IsEmail() @MaxLength(255) contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(50) contactPhone?: string;
}

// ---- Attaching a sponsor to an event --------------------------------------

/** Attach a roster sponsor to an event, with per-event overrides. */
export class AttachSponsorDto {
  @IsUUID() sponsorId: string;

  @IsOptional()
  @IsUUID()
  tierId?: string;

  @IsOptional() @IsInt() @Min(0) order?: number;

  @IsOptional()
  @IsBoolean()
  leadCaptureEnabled?: boolean;

  @IsOptional()
  @IsUrl()
  overrideLogoUrl?: string;

  @IsOptional()
  @IsString()
  overrideDescription?: string;
}

// ---- Sponsor portal access (P5) -------------------------------------------

/** Invite a person (by the email on their Unifesto account) to a sponsor. */
export class InviteSponsorUserDto {
  @IsEmail() @MaxLength(255) email: string;
}

/** Booth scan: link an attendee's ticket QR to a sponsor at an event. */
export class BoothScanDto {
  @IsUUID() eventSponsorId: string;
  @IsString() @MaxLength(200) qrCode: string;
  /**
   * The attendee said yes on the scanner's prompt to sharing their name, email
   * and phone with this sponsor. Scanning a ticket is not consent by itself.
   */
  @Equals(true, { message: 'Ask the attendee first: they have to agree to share their contact details.' })
  attendeeConsent: boolean;
}

/** A sponsor's follow-up on one of its leads (E3). */
export class UpdatePortalLeadDto {
  @IsOptional()
  @IsIn(['NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED'])
  status?: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;
}

/** Patch an existing event-sponsor attachment (all fields optional). */
export class UpdateEventSponsorDto {
  @IsOptional() @IsUUID() tierId?: string | null;
  @IsOptional() @IsInt() @Min(0) order?: number;
  @IsOptional() @IsBoolean() leadCaptureEnabled?: boolean;
  @IsOptional() @IsString() overrideLogoUrl?: string | null;
  @IsOptional() @IsString() overrideDescription?: string | null;
}
