import { IsString, IsOptional, IsIn, IsUUID, IsBoolean, IsNumber, Min, Max, IsEnum, ValidateIf } from 'class-validator';

/**
 * Add a payout method — a BANK account. UPI is no longer an accepted method
 * type (only pre-existing UPI rows remain, for display). Account number + IFSC
 * + bank name are required, alongside `accountHolderName` and `mobileNumber`
 * (the linked mobile). `methodType` is optional and, when present, must be
 * 'BANK'; it defaults to 'BANK' in the service.
 */
export class AddBankAccountDto {
  @IsOptional()
  @IsIn(['BANK'])
  methodType?: 'BANK';

  @IsString()
  accountHolderName: string;

  @IsString()
  mobileNumber: string;

  @IsString()
  accountNumber: string;

  @IsString()
  ifscCode: string;

  @IsString()
  bankName: string;

  @IsOptional()
  @IsIn(['savings', 'current'])
  accountType?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/**
 * Set (or clear) an event's default payout account. `bankAccountId` null clears
 * the override so payouts fall back to the creator's primary account.
 */
export class SetEventPayoutAccountDto {
  @IsOptional()
  @ValidateIf((o) => o.bankAccountId !== null)
  @IsUUID()
  bankAccountId?: string | null;
}

export class CreatePayoutDto {
  @IsUUID()
  eventId: string;

  @IsUUID()
  bankAccountId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePercent?: number;

  /**
   * Custom payout amount (the exact net to transfer). Omit to pay out the whole
   * available balance. Must be > 0 and not exceed the available balance.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  netAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBankAccountStatusDto {
  @IsEnum(['VERIFIED', 'REJECTED'])
  status: 'VERIFIED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

/**
 * Records a payout that an admin has settled manually via their own banking
 * channel (NEFT/IMPS/UPI). Optional UTR / reference for the audit trail.
 */
export class MarkPayoutPaidDto {
  @IsOptional()
  @IsString()
  utr?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
