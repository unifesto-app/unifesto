import { PartialType } from '@nestjs/mapped-types';
import { CouponDiscountType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { MAX_GROUP_SIZE } from '../../registrations/registration.util';

/**
 * Create a discount code on one event. `code` is normalised to uppercase by the
 * service; the buyer types it case-insensitively at checkout.
 */
export class CreateCouponDto {
  @IsString()
  @Length(3, 64)
  // Letters, digits, dash and underscore only — no spaces, so a code round-trips
  // cleanly through a URL or a printed flyer.
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Code may contain only letters, digits, dashes and underscores',
  })
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscountAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPurchaseAmount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  appliesToTicketTypeIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/** Every field optional — patch an existing coupon. `code` stays editable. */
export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

/**
 * Buyer-facing: validate a code against a specific ticket selection and get back
 * the discount it would apply. Does NOT reserve a slot — the reservation happens
 * only when the payment order is created.
 */
export class ValidateCouponDto {
  @IsString()
  @MaxLength(64)
  code: string;

  @IsUUID()
  ticketTypeId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  groupSize?: number;
}
