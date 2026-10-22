import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  @ApiProperty({ example: 'EARLYBIRD' })
  @IsString()
  @Length(3, 64)
  // Letters, digits, dash and underscore only — no spaces, so a code round-trips
  // cleanly through a URL or a printed flyer.
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'Code may contain only letters, digits, dashes and underscores',
  })
  code: string;

  @ApiPropertyOptional({ example: 'Early-bird 20% off, first 100 orders' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: CouponDiscountType, example: CouponDiscountType.PERCENT })
  @IsEnum(CouponDiscountType)
  discountType: CouponDiscountType;

  @ApiProperty({
    example: 20,
    description: 'PERCENT: 0-100. FLAT: an amount in the ticket currency.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({
    example: 500,
    description: 'Percentage coupons only: cap the money taken off.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum base ticket amount required for the code to apply.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPurchaseAmount?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Total redemptions allowed across all users. Omit for unlimited.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @ApiPropertyOptional({ example: '2026-09-20T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Restrict to these ticket type ids. Omit / empty = every ticket type.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  appliesToTicketTypeIds?: string[];

  @ApiPropertyOptional({ default: true })
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
  @ApiProperty({ example: 'EARLYBIRD' })
  @IsString()
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: 'ticket-type-uuid' })
  @IsUUID()
  ticketTypeId: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 3, description: 'People count for GROUP tickets.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  groupSize?: number;
}
