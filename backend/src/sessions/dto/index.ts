import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'Breaking into Product Management' })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiProperty({ enum: SessionPlatform, example: SessionPlatform.GOOGLE_MEET })
  @IsEnum(SessionPlatform)
  platform: SessionPlatform;

  @ApiPropertyOptional({
    example: 'https://meet.google.com/abc-defg-hij',
    description:
      'Required for external platforms; omit for UNIFESTO_LIVE (no shareable URL).',
  })
  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @ApiPropertyOptional({
    description: 'Free-text platform name when platform is OTHER',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOther?: string;

  @ApiProperty({ example: '2026-08-01T13:30:00Z' })
  @IsDateString()
  startDateTime: string;

  @ApiPropertyOptional({ example: 60, default: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Max attendees. Omit for unlimited.',
    example: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ description: '0 or omitted = free', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: SessionVisibility })
  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;

  @ApiPropertyOptional({
    description:
      'UNIFESTO_LIVE only. true (default) = interactive (attendees can publish); false = broadcast (only host publishes).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  interactive?: boolean;
}

/** All fields optional — organiser edits a subset of a draft/published session. */
export class UpdateSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiPropertyOptional({ enum: SessionPlatform })
  @IsOptional()
  @IsEnum(SessionPlatform)
  platform?: SessionPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  platformOther?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: SessionVisibility })
  @IsOptional()
  @IsEnum(SessionVisibility)
  visibility?: SessionVisibility;
}

export class CancelSessionDto {
  @ApiPropertyOptional({
    description: 'Shown to attendees in the cancel notice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AddRecordingDto {
  @ApiProperty({ example: 'https://youtu.be/…' })
  @IsUrl()
  recordingUrl: string;
}

export class AddCoHostDto {
  @ApiProperty({
    example: 'guest@example.com',
    description: 'Email of an existing Unifesto user to add as co-host',
  })
  @IsEmail()
  email: string;
}

export class VerifySessionPaymentDto {
  @ApiProperty()
  @IsString()
  registrationId: string;

  @ApiProperty()
  @IsString()
  razorpayOrderId: string;

  @ApiProperty()
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty()
  @IsString()
  razorpaySignature: string;
}
