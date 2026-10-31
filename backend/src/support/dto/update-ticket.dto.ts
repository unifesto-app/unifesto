import { IsOptional, IsEnum, IsUUID, ValidateIf } from 'class-validator';
import {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
} from '@prisma/client';

/**
 * Admin-only ticket mutations: change status, priority, category, or reassign.
 * Pass `assignedToId: null` to unassign.
 */
export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  assignedToId?: string | null;
}
