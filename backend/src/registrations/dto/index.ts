import { Transform, Type } from 'class-transformer';
import { WaitlistStatus } from '@prisma/client';
import {
  IsString,
  IsInt,
  Min,
  IsOptional,
  IsObject,
  IsUUID,
  Max,
  IsArray,
  IsEmail,
  IsNotEmpty,
  Matches,
  ValidateNested,
  ArrayNotEmpty,
  IsIn,
  MaxLength,
  IsBoolean,
  ArrayMaxSize,
} from 'class-validator';
import { MAX_GROUP_SIZE } from '../registration.util';
import { BADGE_LAYOUT_KEYS, type BadgeLayoutKey } from '../badges.util';

/**
 * One captured attendee for a GROUP registration. Name, email and mobile are
 * required and validated so members can actually be emailed their ticket and
 * identified at check-in — the API is the source of truth, independent of any
 * client-side checks. `gender`/`customFields` are declared so the global
 * `forbidNonWhitelisted` pipe accepts the member payloads the app sends.
 */
export class GroupMemberDto {
  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a name' })
  name: string;

  @IsEmail({}, { message: 'Each group member needs a valid email' })
  email: string;

  @Matches(/^[0-9]{10}$/, {
    message: 'Each group member needs a valid 10-digit mobile number',
  })
  mobile: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}

/**
 * Campaign attribution the app forwards from the tagged link that brought the
 * attendee to this event (utm_source / utm_medium / utm_campaign). Optional and
 * best-effort: the service normalises and truncates, it never rejects a
 * registration over a malformed tag.
 */
export class UtmAttributionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;
}

/**
 * One captured member of a manually-added GROUP registration. Looser than
 * GroupMemberDto: an organiser adding a team by hand may not have every member's
 * mobile, so only name + email are required here.
 */
export class ManualGroupMemberDto {
  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a name' })
  name: string;

  // Every member of a group is an attendee, so name/email/phone/gender are all
  // required — matching the primary attendee and the live registration flow.
  @IsEmail({}, { message: 'Each group member needs a valid email' })
  email: string;

  @Matches(/^[0-9]{10}$/, { message: 'Each group member needs a 10-digit mobile' })
  mobile: string;

  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a gender' })
  @MaxLength(30)
  gender: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}

/**
 * Organiser-initiated single attendee add. When `collectPayment` is true the
 * attendee is created PENDING and Razorpay emails/texts them a payment link for
 * the ticket amount; otherwise they are comped — a confirmed, zero-amount
 * registration. Free/RSVP ticket types are always comped regardless of the flag.
 */
export class ManualAddAttendeeDto {
  @IsUUID()
  ticketTypeId: string;

  @IsString()
  @IsNotEmpty({ message: 'Attendee name is required' })
  @MaxLength(255)
  name: string;

  @IsEmail({}, { message: 'A valid attendee email is required' })
  email: string;

  @Matches(/^[0-9]{10}$/, { message: 'A valid 10-digit mobile is required' })
  mobile: string;

  @IsString()
  @IsNotEmpty({ message: 'Attendee gender is required' })
  @MaxLength(30)
  gender: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  groupSize?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualGroupMemberDto)
  groupMembers?: ManualGroupMemberDto[];

  @IsOptional()
  @IsObject()
  formResponses?: Record<string, any>;

  @IsOptional()
  @IsObject()
  leadCustomFields?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  collectPayment?: boolean;

  @IsOptional()
  @IsBoolean()
  sendTicketEmail?: boolean;
}

export class CreateOrderDto extends UtmAttributionDto {
  @IsUUID()
  ticketTypeId: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  groupSize?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupMemberDto)
  groupMembers?: GroupMemberDto[];

  @IsOptional()
  @IsObject()
  formResponses?: Record<string, any>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;
}

export class UpdateGroupMembersDto {
  @IsArray()
  @ArrayNotEmpty()
  // Not @ValidateNested: it rejects the `null` gaps. Each non-null entry is
  // validated field by field in RegistrationsService.parseRosterUpdate.
  // Keep the raw array: with the global `enableImplicitConversion`, the
  // reflected element type (a union → Array) turned every member object into
  // an empty array `[]`, so every roster save was rejected.
  @Transform(({ obj }) => obj.groupMembers)
  groupMembers: (GroupMemberDto | null)[];
}

/** Attendee's "I've joined the WhatsApp group" self-mark from their ticket. */
export class SetWhatsappJoinedDto {
  @IsBoolean()
  joined: boolean;
}

export class VerifyPaymentDto {
  @IsString()
  razorpayOrderId: string;

  @IsString()
  razorpayPaymentId: string;

  @IsString()
  razorpaySignature: string;

  @IsUUID()
  registrationId: string;
}

export class VerifyRegistrationDto {
  @IsString()
  orderId: string;

  @IsString()
  paymentId: string;

  @IsString()
  signature: string;
}

export class OrderResponseDto {
  registrationId: string;

  razorpayOrderId: string | null;

  razorpayKeyId: string | null;

  amount: number;

  currency: string;

  breakdown: {
    baseAmount: number;
    // Money taken off the base by an applied coupon (0 when none). The
    // processing fee and totalAmount below are already net of this.
    couponDiscount: number;
    couponCode?: string;
    processingFee: number;
    razorpayAmount: number;
    totalAmount: number;
  };
}

/**
 * Returned instead of an order when the ticket sold out and the buyer was put
 * on the waiting list. Clients must branch on `isWaitlisted` before trying to
 * open a checkout sheet: there is no order to pay yet.
 */
export class WaitlistJoinResponseDto {
  registrationId: string;

  isWaitlisted: true;

  waitlistStatus: WaitlistStatus;

  position: number;

  message: string;
}

/** Organiser batch action: let the next N people in for one ticket type. */
export class AllowNextFromWaitlistDto {
  @IsUUID()
  ticketTypeId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  count?: number;
}

export class RegistrationResponseDto {
  registrationId: string;

  message: string;

  qrCode?: string;

  tickets?: any[];
}

/**
 * Admin manual resolution of a stuck PENDING registration that reconcile can't
 * settle — e.g. an abandoned duplicate with no payment of its own. Deliberately
 * limited to non-money outcomes: PAID is never fabricated here (use reconcile
 * with the real payment id), and a PAID row is refunded, not overridden.
 */
export class AdminResolvePendingDto {
  @IsIn(['FAILED', 'CANCELLED'])
  outcome: 'FAILED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Transfer a registration to the account that owns this email. */
export class TransferRegistrationDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/** Organiser's request for an admin to transfer a registration. */
export class CreateTransferRequestDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Admin's decision on a transfer request. */
export class ReviewTransferRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Attendee cancels their own (free) registration from their ticket. */
export class CancelMyRegistrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Print badges (N1): a layout plus the roster's selection (rows, or its filters). */
export class PrintBadgesDto {
  @IsIn(BADGE_LAYOUT_KEYS)
  layout: BadgeLayoutKey;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  registrationIds?: string[];

  @IsOptional() @IsUUID() ticketTypeId?: string;
  @IsOptional() @IsIn(['REGISTERED', 'ATTENDED']) status?: 'REGISTERED' | 'ATTENDED';
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}
