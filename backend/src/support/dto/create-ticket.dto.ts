import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsEnum,
  IsEmail,
  MaxLength,
  MinLength,
  IsObject,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SupportCaseKind,
  SupportTicketCategory,
  SupportTicketPriority,
} from '@prisma/client';

/** Kinds a requester can open directly; the rest are opened by their own flows (refunds, requests…). */
export const SELF_SERVE_CASE_KINDS: SupportCaseKind[] = [
  SupportCaseKind.HELP,
  SupportCaseKind.REPORT,
  SupportCaseKind.PRIVACY,
  SupportCaseKind.GRIEVANCE,
];

export class CreateTicketDto {
  @ApiProperty({ example: 'My QR ticket did not arrive' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @ApiProperty({
    example: 'I registered for the fest but never received my QR code…',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ enum: SupportTicketCategory })
  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  /** Accepted so older apps don't fail validation, but ignored (J1): priority is set by plan and triage. */
  @ApiPropertyOptional({ enum: SupportTicketPriority, deprecated: true })
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @ApiPropertyOptional({
    description: 'Space this ticket is raised from (organiser context)',
  })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    description: 'The app build it was raised from (version, build, runtime, update id, platform)',
  })
  @IsOptional()
  @IsObject()
  clientInfo?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'me@example.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ enum: SELF_SERVE_CASE_KINDS, default: SupportCaseKind.HELP })
  @IsOptional()
  @IsIn(SELF_SERVE_CASE_KINDS)
  kind?: SupportCaseKind;

  @ApiPropertyOptional({ description: 'Event this case is about' })
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ApiPropertyOptional({ description: "Requester's own registration this case is about (sets eventId)" })
  @IsOptional()
  @IsUUID()
  registrationId?: string;
}
