import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeatInviteDto {
  /** Target a specific OPEN seat; omit to fill the next available OPEN seat. */
  @IsOptional()
  @IsInt()
  @Min(1)
  seatIndex?: number;

  @IsEmail()
  email: string;
}

export class InviteSeatsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SeatInviteDto)
  invites: SeatInviteDto[];
}

export class ClaimSeatDto {
  /** Member's own details answered at claim time (name/mobile/gender/customFields). */
  @IsOptional()
  @IsObject()
  memberDetails?: Record<string, unknown>;
}

/** Add seats to a group (team changes). */
export class AddSeatsDto {
  @IsInt()
  @Min(1)
  @Max(20)
  seats!: number;
}

/** Hand the lead to the member on this seat. */
export class LeadTransferDto {
  @IsInt()
  @Min(2)
  seatIndex!: number;
}

export class RespondLeadTransferDto {
  @IsBoolean()
  accept!: boolean;
}

export class VerifyAddSeatsDto {
  @IsString()
  razorpayOrderId!: string;

  @IsString()
  razorpayPaymentId!: string;

  @IsString()
  razorpaySignature!: string;
}
