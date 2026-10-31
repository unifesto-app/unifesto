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
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  /** Accepted so older apps don't fail validation, but ignored (J1): priority is set by plan and triage. */
  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsObject()
  clientInfo?: Record<string, unknown>;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsIn(SELF_SERVE_CASE_KINDS)
  kind?: SupportCaseKind;

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsUUID()
  registrationId?: string;
}
