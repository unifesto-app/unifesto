import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED'] as const;

// ---- Public capture -------------------------------------------------------

/** "Notify me" / interest on an event, or an inquiry on a space page. */
export class CaptureLeadDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsEmail() @MaxLength(255) email: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

// ---- Curator management ---------------------------------------------------

/** Manually add a lead to the funnel. */
export class CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsIn(LEAD_STATUSES)
  status?: (typeof LEAD_STATUSES)[number];

  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsEmail() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}
