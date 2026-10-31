import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
  IsUrl,
  IsBoolean,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { SessionPlatform, SessionVisibility } from '@prisma/client';

export class CreateSessionDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsEnum(SessionPlatform)
  platform: SessionPlatform;

  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOther?: string;

  @IsDateString()
  startDateTime: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;

  @IsOptional()
  @IsBoolean()
  interactive?: boolean;
}

/** All fields optional — organiser edits a subset of a draft/published session. */
export class UpdateSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @IsOptional()
  @IsEnum(SessionPlatform)
  platform?: SessionPlatform;

  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOther?: string;

  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;

  @IsOptional()
  @IsBoolean()
  interactive?: boolean;
}

export class CancelSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AddRecordingDto {
  @IsUrl()
  recordingUrl: string;
}

export class AddCoHostDto {
  @IsEmail()
  email: string;
}

export class VerifySessionPaymentDto {
  @IsString()
  registrationId: string;

  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;
}
