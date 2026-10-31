import {
  IsString,
  IsEnum,
  IsIn,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  IsUUID,
  IsNumber,
  IsUrl,
  MaxLength,
  ValidateNested,
  Matches,
  ValidateIf,
  IsObject,
} from 'class-validator';
import { MAX_GROUP_SIZE } from '../../registrations/registration.util';
import { Type, Transform } from 'class-transformer';
import { MAX_EVENT_CATEGORIES } from '../event-categories';
import {
  EventType,
  EventVisibility,
  RegistrationType,
  FormFieldType,
  TicketKind,
  GroupPricingMode,
} from '@prisma/client';

export class CreateEventDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(EventType)
  type: EventType;

  @IsEnum(RegistrationType)
  registrationType: RegistrationType;

  @IsDateString()
  startDateTime: string;

  @IsDateString()
  endDateTime: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  venueAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsUrl()
  onlineUrl?: string;

  @IsOptional()
  @IsString()
  onlinePlatform?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categories?: string[];

  @IsEnum(EventVisibility)
  visibility: EventVisibility;

  @IsString()
  spaceId: string;

  @IsOptional()
  @IsUUID()
  parentEventId?: string;

  @IsOptional()
  @IsString()
  whatsappAttendeeGroupUrl?: string;

  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}

/** Attach an existing event as a sub-event of a parent ("big") event. */
export class AttachSubEventDto {
  @IsUUID()
  eventId: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug may only contain lowercase letters, numbers and single hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsEnum(RegistrationType)
  registrationType?: RegistrationType;

  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @IsString()
  venueAddress?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsString()
  onlineUrl?: string;

  @IsOptional()
  @IsString()
  onlinePlatform?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  absorbProcessingFee?: boolean;

  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categories?: string[];

  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @IsOptional()
  @IsString()
  whatsappAttendeeGroupUrl?: string;

  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}

export class CancelEventDto {
  @IsString()
  reason: string;
}

export class CreateTicketTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsEnum(TicketKind)
  kind?: TicketKind;

  @IsOptional()
  @IsEnum(GroupPricingMode)
  groupPricingMode?: GroupPricingMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  minGroupSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  maxGroupSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  blocksTicketTypeIds?: string[];

  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  // accepted for old clients, ignored
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  waitlistOfferTtlHours?: number;

  @IsOptional()
  @IsString()
  whatsappGroupUrl?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderTicketTypesDto {
  @IsArray()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class UpdateTicketTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsEnum(TicketKind)
  kind?: TicketKind;

  @IsOptional()
  @IsEnum(GroupPricingMode)
  groupPricingMode?: GroupPricingMode;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  minGroupSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_GROUP_SIZE)
  maxGroupSize?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  blocksTicketTypeIds?: string[];

  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  // accepted for old clients, ignored
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  waitlistOfferTtlHours?: number;

  @IsOptional()
  @IsString()
  whatsappGroupUrl?: string;
}

export class CreateAgendaDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;

  @IsOptional()
  @IsString()
  speakerName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateSpeakerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateAgendaDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  speakerName?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateSpeakerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePrizeDto {
  @IsString()
  @MaxLength(500)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdatePrizeDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  rank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateContactDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateFaqDto {
  @IsString()
  question: string;

  @IsString()
  answer: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateFaqDto {
  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  answer?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateFormFieldDto {
  @IsOptional()
  @IsString()
  ticketTypeId?: string;

  @IsString()
  label: string;

  @IsEnum(FormFieldType)
  type: FormFieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  perGroup?: boolean;

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

export class UpdateFormFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(FormFieldType)
  type?: FormFieldType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  perGroup?: boolean;

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

export class EventFilterDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  spaceId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeSubEvents?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  trending?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  free?: boolean;

  @IsOptional()
  @IsIn(['upcoming', 'past'])
  when?: 'upcoming' | 'past';
}

export class AddCoHostDto {
  @IsString()
  spaceId: string;
}

/** Propose handing an event's ownership to one of its co-host spaces. */
export class RequestEventTransferDto {
  @IsUUID()
  toSpaceId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Accept or decline a pending ownership-transfer offer. */
export class ReviewEventTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

/** Ask another space to let its event be nested under your parent event. */
export class RequestSubEventAttachDto {
  @IsUUID()
  eventId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Accept or decline a pending sub-event attach request. */
export class ReviewSubEventAttachDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

/**
 * The event-scoped roles a Space Admin / Curator may hand out on an event.
 * A subset of `RoleCode` — you cannot make someone a platform admin or space
 * admin through the event team. Legacy VOLUNTEER is not offered for new grants
 * (it maps to CREW); existing VOLUNTEER rows still list fine.
 */
export enum EventTeamRole {
  CURATOR = 'CURATOR',
  CO_CURATOR = 'CO_CURATOR',
  CREW = 'CREW',
}

export class AddTeamMemberDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsEnum(EventTeamRole)
  roleCode?: EventTeamRole;
}
