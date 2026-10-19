import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { BADGE_LAYOUT_KEYS, type BadgeLayoutKey } from '../badges.util';

/**
 * One captured attendee for a GROUP registration. Name, email and mobile are
 * required and validated so members can actually be emailed their ticket and
 * identified at check-in — the API is the source of truth, independent of any
 * client-side checks. `gender`/`customFields` are declared so the global
 * `forbidNonWhitelisted` pipe accepts the member payloads the app sends.
 */
export class GroupMemberDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a name' })
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail({}, { message: 'Each group member needs a valid email' })
  email: string;

  @ApiProperty({ example: '9876543210', description: '10-digit mobile number.' })
  @Matches(/^[0-9]{10}$/, {
    message: 'Each group member needs a valid 10-digit mobile number',
  })
  mobile: string;

  @ApiPropertyOptional({ example: 'Male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({
    description: 'Answers to custom form fields, keyed by field id.',
  })
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
  @ApiPropertyOptional({ example: 'instagram' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmSource?: string;

  @ApiPropertyOptional({ example: 'social' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmMedium?: string;

  @ApiPropertyOptional({ example: 'launch_week' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  utmCampaign?: string;
}

export class RegisterForEventDto extends UtmAttributionDto {
  @ApiPropertyOptional({ example: 'ticket-type-uuid' })
  @IsOptional()
  @IsUUID()
  ticketTypeId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @ApiPropertyOptional({
    example: 3,
    description: 'Number of people, for GROUP tickets.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  groupSize?: number;

  @ApiPropertyOptional({
    description: 'Captured attendee details for GROUP tickets.',
    type: [GroupMemberDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupMemberDto)
  groupMembers?: GroupMemberDto[];

  @ApiPropertyOptional({ example: { dietaryPreference: 'Vegetarian' } })
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, any>;
}

/**
 * One captured member of a manually-added GROUP registration. Looser than
 * GroupMemberDto: an organiser adding a team by hand may not have every member's
 * mobile, so only name + email are required here.
 */
export class ManualGroupMemberDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a name' })
  name: string;

  // Every member of a group is an attendee, so name/email/phone/gender are all
  // required — matching the primary attendee and the live registration flow.
  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail({}, { message: 'Each group member needs a valid email' })
  email: string;

  @ApiProperty({ example: '9876543210' })
  @Matches(/^[0-9]{10}$/, { message: 'Each group member needs a 10-digit mobile' })
  mobile: string;

  @ApiProperty({ example: 'Male' })
  @IsString()
  @IsNotEmpty({ message: 'Each group member needs a gender' })
  @MaxLength(30)
  gender: string;

  @ApiPropertyOptional({
    description: "This member's own custom-field answers, keyed by field id.",
  })
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
  @ApiProperty({ example: 'ticket-type-uuid' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ example: 'Asha Rao' })
  @IsString()
  @IsNotEmpty({ message: 'Attendee name is required' })
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'asha@example.com' })
  @IsEmail({}, { message: 'A valid attendee email is required' })
  email: string;

  @ApiProperty({ example: '9876543210', description: '10-digit mobile (required).' })
  @Matches(/^[0-9]{10}$/, { message: 'A valid 10-digit mobile is required' })
  mobile: string;

  @ApiProperty({ example: 'Male', description: 'Attendee gender (required).' })
  @IsString()
  @IsNotEmpty({ message: 'Attendee gender is required' })
  @MaxLength(30)
  gender: string;

  @ApiPropertyOptional({ example: 3, description: 'Number of people, for GROUP tickets.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  groupSize?: number;

  @ApiPropertyOptional({ type: [ManualGroupMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualGroupMemberDto)
  groupMembers?: ManualGroupMemberDto[];

  @ApiPropertyOptional({
    description:
      'Registration-level answers: the attendee\'s answers for an individual ticket, or the team-wide (per-group) answers for a group ticket.',
    example: { teamName: 'Rockets' },
  })
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      "The lead member's own per-member answers (group tickets only), keyed by field id.",
  })
  @IsOptional()
  @IsObject()
  leadCustomFields?: Record<string, any>;

  @ApiPropertyOptional({
    description:
      'Send a Razorpay payment link for the ticket amount. Ignored for free/RSVP ticket types (always comped).',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  collectPayment?: boolean;

  @ApiPropertyOptional({
    description: 'Email the ticket immediately when comping (no payment).',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  sendTicketEmail?: boolean;
}

export class CreateOrderDto extends UtmAttributionDto {
  @ApiProperty({ example: 'ticket-type-uuid' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;

  @ApiPropertyOptional({ example: 3, description: 'People count for GROUP tickets.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  groupSize?: number;

  @ApiPropertyOptional({
    description: 'Captured attendee details for GROUP tickets.',
    type: [GroupMemberDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupMemberDto)
  groupMembers?: GroupMemberDto[];

  @ApiPropertyOptional({ example: { dietaryPreference: 'Vegetarian' } })
  @IsOptional()
  @IsObject()
  formResponses?: Record<string, any>;

  @ApiPropertyOptional({
    example: 'EARLYBIRD',
    description:
      'Optional discount code. Applied case-insensitively to the base ticket amount; the processing fee is recomputed on the discounted base.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;
}

export class UpdateGroupMembersDto {
  @ApiProperty({
    description:
      'The roster by seat position (index 0 = seat 1, the lead). A `null` entry ' +
      'leaves that seat untouched, so a lead can edit one member without ' +
      're-sending (or inventing details for) open and invited seats.',
    type: [GroupMemberDto],
  })
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
  @ApiProperty({
    example: true,
    description:
      'true = I have joined the group (suppresses future invite sends); ' +
      'false = clear the mark.',
  })
  @IsBoolean()
  joined: boolean;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'order_abc123' })
  @IsString()
  razorpayOrderId: string;

  @ApiProperty({ example: 'pay_xyz789' })
  @IsString()
  razorpayPaymentId: string;

  @ApiProperty({ example: 'signature_hash' })
  @IsString()
  razorpaySignature: string;

  @ApiProperty({ example: 'registration-uuid' })
  @IsUUID()
  registrationId: string;
}

export class VerifyRegistrationDto {
  @ApiProperty({ example: 'order_abc123' })
  @IsString()
  orderId: string;

  @ApiProperty({ example: 'pay_xyz789' })
  @IsString()
  paymentId: string;

  @ApiProperty({ example: 'signature_hash' })
  @IsString()
  signature: string;
}

export class OrderResponseDto {
  @ApiProperty()
  registrationId: string;

  @ApiProperty({ nullable: true })
  razorpayOrderId: string | null;

  @ApiProperty({ nullable: true })
  razorpayKeyId: string | null;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
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
  @ApiProperty()
  registrationId: string;

  @ApiProperty({ example: true })
  isWaitlisted: true;

  @ApiProperty({ enum: WaitlistStatus, example: WaitlistStatus.WAITING })
  waitlistStatus: WaitlistStatus;

  @ApiProperty({ example: 4, description: '1-based place in the queue.' })
  position: number;

  @ApiProperty()
  message: string;
}

/** Organiser batch action: let the next N people in for one ticket type. */
export class AllowNextFromWaitlistDto {
  @ApiProperty({ description: 'Ticket type whose queue to draw from.' })
  @IsUUID()
  ticketTypeId: string;

  @ApiPropertyOptional({
    example: 5,
    default: 1,
    description:
      'How many to let in. Capped at the seats actually free, so asking for ' +
      'more than exist admits everyone who fits rather than failing.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  count?: number;
}

export class RegistrationResponseDto {
  @ApiProperty()
  registrationId: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  qrCode?: string;

  @ApiProperty()
  tickets?: any[];
}

/**
 * Admin manual resolution of a stuck PENDING registration that reconcile can't
 * settle — e.g. an abandoned duplicate with no payment of its own. Deliberately
 * limited to non-money outcomes: PAID is never fabricated here (use reconcile
 * with the real payment id), and a PAID row is refunded, not overridden.
 */
export class AdminResolvePendingDto {
  @ApiProperty({ enum: ['FAILED', 'CANCELLED'] })
  @IsIn(['FAILED', 'CANCELLED'])
  outcome: 'FAILED' | 'CANCELLED';

  @ApiPropertyOptional({ description: 'Reason, kept in the logs for audit.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Transfer a registration to the account that owns this email. */
export class TransferRegistrationDto {
  @ApiProperty({ description: 'Email of the account to transfer the ticket to.' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

/** Organiser's request for an admin to transfer a registration. */
export class CreateTransferRequestDto {
  @ApiProperty({ description: 'Email of the account to transfer the ticket to.' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Why the transfer is needed.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Admin's decision on a transfer request. */
export class ReviewTransferRequestDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] })
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ description: 'Note kept with the decision.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;

  @ApiPropertyOptional({
    description: 'Override the target email before approving.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

/** Attendee cancels their own (free) registration from their ticket. */
export class CancelMyRegistrationDto {
  @ApiPropertyOptional({ example: 'Can no longer attend' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Print badges (N1): a layout plus the roster's selection (rows, or its filters). */
export class PrintBadgesDto {
  @ApiProperty({ enum: BADGE_LAYOUT_KEYS })
  @IsIn(BADGE_LAYOUT_KEYS)
  layout: BadgeLayoutKey;

  @ApiPropertyOptional({ type: [String], description: 'Selected registrations; omit for everyone matching the filters' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5000)
  @IsUUID('all', { each: true })
  registrationIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsUUID() ticketTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['REGISTERED', 'ATTENDED']) status?: 'REGISTERED' | 'ATTENDED';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) search?: string;
}
