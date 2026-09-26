import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsEnum,
  IsIn,
  MaxLength,
} from 'class-validator';

/** Raised by an attendee (for their own registration) or an organiser. */
export class CreateRefundRequestDto {
  @IsUUID()
  registrationId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;

  /** Desired refund amount (base only). Omit to request the full base amount. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  requestedAmount?: number;

  /** Links the request to the support ticket it originated from, if any. */
  @IsOptional()
  @IsUUID()
  supportTicketId?: string;

  /**
   * @deprecated Legacy field from the removed wallet refund-method picker.
   * Older mobile builds still send it; accepted only so the global
   * forbidNonWhitelisted pipe doesn't reject them. Ignored — refunds are
   * always BANK now.
   */
  @IsOptional()
  @IsIn(['BANK', 'WALLET'])
  refundMethod?: 'BANK' | 'WALLET';
}

/** Organiser verification of an attendee-raised request. */
export class CuratorReviewDto {
  @IsEnum(['FORWARD', 'REJECT'])
  action: 'FORWARD' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Admin's final decision. On APPROVE, `approvedAmount` may be a partial value. */
export class AdminDecisionDto {
  @IsEnum(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  /** Base amount to refund. Omit on APPROVE to refund the full remaining base. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/**
 * Admin raises and settles a refund directly, skipping the attendee→organiser
 * stages. `reason` is required (it becomes the audit note).
 */
export class AdminRefundDto {
  @IsUUID()
  registrationId: string;

  @IsString()
  @MaxLength(1000)
  reason: string;

  /** Base amount to refund. Omit to refund the full remaining base. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedAmount?: number;
}
