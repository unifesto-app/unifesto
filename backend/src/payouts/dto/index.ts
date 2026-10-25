import { IsString, IsOptional, IsIn, IsUUID, IsBoolean, IsNumber, IsPositive, Min, Max, IsEnum, ValidateIf, Matches, Length } from 'class-validator';
import { Transform } from 'class-transformer';

/** A32: payout-method formats, shared with the service so a bypassed DTO can't skip them. */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ACCOUNT_NUMBER_RE = /^\d{9,18}$/;
export const UPI_RE = /^[\w.\-]{2,}@[a-zA-Z]{2,}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const isBank = (o: AddBankAccountDto) => o.methodType !== 'UPI';

/**
 * Add a payout method: a BANK account (number + IFSC + bank name) or a UPI
 * handle (A32). `accountHolderName` is the holder or UPI payee name and
 * `mobileNumber` the linked mobile, for both. `methodType` defaults to BANK.
 */
export class AddBankAccountDto {
  @IsOptional()
  @IsIn(['BANK', 'UPI'])
  methodType?: 'BANK' | 'UPI';

  @Transform(trim)
  @IsString()
  @Length(2, 255)
  accountHolderName: string;

  @Transform(trim)
  @IsString()
  @Length(10, 20)
  mobileNumber: string;

  @ValidateIf(isBank)
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @Matches(ACCOUNT_NUMBER_RE, { message: 'Account number must be 9 to 18 digits' })
  accountNumber?: string;

  @ValidateIf(isBank)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(IFSC_RE, { message: 'Enter a valid IFSC code, like HDFC0001234' })
  ifscCode?: string;

  @ValidateIf(isBank)
  @Transform(trim)
  @IsString()
  @Length(2, 255)
  bankName?: string;

  @ValidateIf((o: AddBankAccountDto) => o.methodType === 'UPI')
  @Transform(trim)
  @Matches(UPI_RE, { message: 'Enter a valid UPI ID, like name@okhdfc' })
  upiId?: string;

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

/**
 * `POST /payouts/request` (organiser) and, without `bankAccountId`,
 * `POST /payouts/admin/create-for-event`. `amount` omitted = whole available
 * balance; when present it must be a finite positive number (S29: "abc" used to
 * become NaN and slip past every `<=`/`>` guard).
 */
export class CreateEventPayoutDto {
  @IsUUID()
  eventId: string;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  amount?: number;
}

export class RequestPayoutDto extends CreateEventPayoutDto {
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;
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
 * channel (NEFT/IMPS/UPI). The UTR / bank reference is required (A32): 6 to
 * 40 characters, unique per payout.
 */
export class MarkPayoutPaidDto {
  @Transform(trim)
  @IsString()
  @Length(6, 40, { message: 'Enter the UTR or bank reference (6 to 40 characters)' })
  utr: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

/** A32: take back an account's verification, with a note its owner sees. */
export class RevokeBankAccountDto {
  @Transform(trim)
  @IsString()
  @Length(3, 500)
  note: string;
}
