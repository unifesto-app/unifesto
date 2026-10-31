import { PartialType } from '@nestjs/mapped-types';
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
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsEnum(StayPropertyType)
  propertyType?: StayPropertyType;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(100)
  city?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  mapUrl?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  amenities?: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  houseRules?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  contactPhone?: string | null;

  @Matches(DAY, { message: 'checkInFrom must be YYYY-MM-DD' })
  checkInFrom: string;

  @Matches(DAY, { message: 'checkOutUntil must be YYYY-MM-DD' })
  checkOutUntil: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  checkInTime?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  checkOutTime?: string | null;

  @IsOptional()
  @IsBoolean()
  requireIdProof?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  paymentWindowHours?: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateStayDto extends PartialType(CreateStayDto) {}

export class CreateStayOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(StayGender)
  gender?: StayGender;

  @IsInt()
  @Min(1)
  @Max(10000)
  totalBeds: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  price?: number;

  @IsOptional()
  @IsEnum(StayPricing)
  pricing?: StayPricing;

  @IsOptional()
  @IsEnum(StayPaymentMode)
  paymentMode?: StayPaymentMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxGuests?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateStayOptionDto extends PartialType(CreateStayOptionDto) {}

export class CreateStayQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsEnum(FormFieldType)
  type: FormFieldType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  config?: Record<string, unknown> | null;

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsIn([...GUEST_GENDERS])
  gender: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => StayFileDto)
  idProof?: StayFileDto;
}

export class CreateStayBookingDto {
  @IsUUID()
  optionId: string;

  @Matches(DAY, { message: 'checkInDate must be YYYY-MM-DD' })
  checkInDate: string;

  @Matches(DAY, { message: 'checkOutDate must be YYYY-MM-DD' })
  checkOutDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => StayGuestDto)
  guests: StayGuestDto[];

  @IsOptional()
  @IsISO8601()
  arrivalAt?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  emergencyName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  emergencyPhone: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

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

  @IsOptional()
  @IsBoolean()
  refund?: boolean;
}

export class CheckInStayDto {
  @IsOptional()
  @IsBoolean()
  collected?: boolean;
}
