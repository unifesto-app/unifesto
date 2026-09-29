import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FormFieldType,
  StayBookingStatus,
  StayGender,
  StayPaymentMode,
  StayPricing,
  StayPropertyType,
} from '@prisma/client';
import { GUEST_GENDERS } from './stay-rules';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// ---- Setup (event team) ----

export class CreateStayDto {
  @ApiProperty({ example: 'Boys Hostel, Block C' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ enum: StayPropertyType })
  @IsOptional()
  @IsEnum(StayPropertyType)
  propertyType?: StayPropertyType;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @ApiPropertyOptional({
    description: 'Google Maps (or any) link to the property',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  mapUrl?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Wi-Fi', 'Hot water', 'Mess'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  amenities?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  houseRules?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  contactPhone?: string | null;

  @ApiProperty({
    example: '2026-10-10',
    description: 'First day guests can check in',
  })
  @Matches(DAY, { message: 'checkInFrom must be YYYY-MM-DD' })
  checkInFrom: string;

  @ApiProperty({
    example: '2026-10-13',
    description: 'Last day guests can check out',
  })
  @Matches(DAY, { message: 'checkOutUntil must be YYYY-MM-DD' })
  checkOutUntil: string;

  @ApiPropertyOptional({ example: '12:00 PM' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  checkInTime?: string | null;

  @ApiPropertyOptional({ example: '10:00 AM' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  checkOutTime?: string | null;

  @ApiPropertyOptional({ description: 'Every guest uploads a photo ID' })
  @IsOptional()
  @IsBoolean()
  requireIdProof?: boolean;

  @ApiPropertyOptional({
    description: 'Hours an approved guest has to pay online',
    example: 48,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  paymentWindowHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateStayDto extends PartialType(CreateStayDto) {}

export class CreateStayOptionDto {
  @ApiProperty({ example: 'Dorm bed (boys)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: StayGender })
  @IsOptional()
  @IsEnum(StayGender)
  gender?: StayGender;

  @ApiProperty({ example: 40 })
  @IsInt()
  @Min(1)
  @Max(10000)
  totalBeds: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price?: number;

  @ApiPropertyOptional({ enum: StayPricing })
  @IsOptional()
  @IsEnum(StayPricing)
  pricing?: StayPricing;

  @ApiPropertyOptional({ enum: StayPaymentMode })
  @IsOptional()
  @IsEnum(StayPaymentMode)
  paymentMode?: StayPaymentMode;

  @ApiPropertyOptional({
    description: 'Most guests one request can book',
    example: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxGuests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateStayOptionDto extends PartialType(CreateStayOptionDto) {}

export class CreateStayQuestionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @ApiProperty({ enum: FormFieldType })
  @IsEnum(FormFieldType)
  type: FormFieldType;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  config?: Record<string, unknown> | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

export class UpdateStayQuestionDto extends PartialType(CreateStayQuestionDto) {}

// ---- Booking (attendee) ----

export class StayFileDto {
  @IsString()
  @MaxLength(500)
  key: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsInt()
  @Min(0)
  size: number;

  @IsString()
  @MaxLength(120)
  mime: string;
}

export class StayGuestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiProperty({ enum: GUEST_GENDERS })
  @IsIn([...GUEST_GENDERS])
  gender: string;

  @ApiPropertyOptional({
    description: 'Photo ID uploaded via POST /stays/:stayId/upload',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => StayFileDto)
  idProof?: StayFileDto;
}

export class CreateStayBookingDto {
  @ApiProperty()
  @IsUUID()
  optionId: string;

  @ApiProperty({ example: '2026-10-10' })
  @Matches(DAY, { message: 'checkInDate must be YYYY-MM-DD' })
  checkInDate: string;

  @ApiProperty({ example: '2026-10-12' })
  @Matches(DAY, { message: 'checkOutDate must be YYYY-MM-DD' })
  checkOutDate: string;

  @ApiProperty({
    type: [StayGuestDto],
    description: 'The booker first, then teammates',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StayGuestDto)
  guests: StayGuestDto[];

  @ApiPropertyOptional({ description: 'Expected arrival (ISO date-time)' })
  @IsOptional()
  @IsISO8601()
  arrivalAt?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  emergencyName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emergencyPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({
    description: "Answers to the stay's questions, keyed by question id",
  })
  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class VerifyStayPaymentDto {
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}

export class CancelMyStayDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ---- Team actions ----

export class ListStayBookingsQuery {
  @IsOptional()
  @IsEnum(StayBookingStatus)
  status?: StayBookingStatus;

  @IsOptional()
  @IsUUID()
  stayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ApproveStayBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  allocation?: string;
}

export class RejectStayBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateStayBookingDto {
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  allocation?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  staffNote?: string | null;
}

export class CancelStayBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Paid online: refund the stay price (the processing fee is kept)',
  })
  @IsOptional()
  @IsBoolean()
  refund?: boolean;
}
