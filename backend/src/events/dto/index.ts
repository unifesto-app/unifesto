import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
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
  @ApiProperty({ example: 'Tech Conference 2024' })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'A great tech event' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: EventType, example: EventType.IN_PERSON })
  @IsEnum(EventType)
  type: EventType;

  @ApiProperty({
    enum: RegistrationType,
    example: RegistrationType.RSVP,
  })
  @IsEnum(RegistrationType)
  registrationType: RegistrationType;

  @ApiProperty({ example: '2024-12-25T10:00:00Z' })
  @IsDateString()
  startDateTime: string;

  @ApiProperty({ example: '2024-12-25T18:00:00Z' })
  @IsDateString()
  endDateTime: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Convention Center' })
  @IsOptional()
  @IsString()
  venueName?: string;

  @ApiPropertyOptional({ example: '123 Main St' })
  @IsOptional()
  @IsString()
  venueAddress?: string;

  @ApiPropertyOptional({ example: 'Mumbai' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Maharashtra' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'India' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 19.076 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 72.8777 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ example: 'https://zoom.us/meeting' })
  @IsOptional()
  @IsUrl()
  onlineUrl?: string;

  @ApiPropertyOptional({ example: 'Zoom' })
  @IsOptional()
  @IsString()
  onlinePlatform?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ example: ['tech', 'conference'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ example: 'Technology' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: ['Technology', 'Workshop'], description: 'Primary first; sets `category` too.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categories?: string[];

  @ApiProperty({
    enum: EventVisibility,
    example: EventVisibility.PUBLIC,
  })
  @IsEnum(EventVisibility)
  visibility: EventVisibility;

  @ApiProperty({ example: 'space-uuid' })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({
    example: 'parent-event-uuid',
    description:
      'Attach this event as a sub-event of a "big event" on creation. The ' +
      'parent must be in the same space as this event, or this event\'s space ' +
      'must co-host the parent. Sub-events may themselves nest, up to the ' +
      'platform depth limit.',
  })
  @IsOptional()
  @IsUUID()
  parentEventId?: string;

  @ApiPropertyOptional({
    example: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
    description:
      "Private WhatsApp attendee invite group. Pushed only to registered " +
      'attendees (registration confirmation + curator blast) and never returned ' +
      'on the public event payload. Validated + normalised server-side.',
  })
  @IsOptional()
  @IsString()
  whatsappAttendeeGroupUrl?: string;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;BYDAY=SA;COUNT=10',
    description:
      'Make this a recurring series (event-calendar P2). An RFC-5545 RRULE — ' +
      'FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, with optional INTERVAL, COUNT|UNTIL, ' +
      'and BYDAY (WEEKLY only). The created event becomes a non-registerable ' +
      'series parent; concrete occurrences are materialized from it. May not be ' +
      'combined with parentEventId (a series may not also be a festival sub-event).',
  })
  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}

/** Attach an existing event as a sub-event of a parent ("big") event. */
export class AttachSubEventDto {
  @ApiProperty({
    example: 'child-event-uuid',
    description: 'The event to attach as a sub-event. Same space as the parent.',
  })
  @IsUUID()
  eventId: string;
}

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional({
    example: 'my-tech-meetup',
    description:
      'URL slug. Lowercase letters, numbers and hyphens only. Must be unique.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug may only contain lowercase letters, numbers and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional({ enum: RegistrationType })
  @IsOptional()
  @IsEnum(RegistrationType)
  registrationType?: RegistrationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDateTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDateTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venueName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venueAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  onlineUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  onlinePlatform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: ['Technology', 'Workshop'], description: 'Primary first; sets `category` too.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EVENT_CATEGORIES)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  categories?: string[];

  @ApiPropertyOptional({ enum: EventVisibility })
  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @ApiPropertyOptional({
    description:
      'Private WhatsApp attendee invite group — pushed only to registered ' +
      'attendees, never public. Pass an empty string to clear it. Validated + ' +
      'normalised server-side.',
  })
  @IsOptional()
  @IsString()
  whatsappAttendeeGroupUrl?: string;

  @ApiPropertyOptional({
    example: 'FREQ=WEEKLY;BYDAY=SA;COUNT=10',
    description:
      'Change the recurrence rule of an existing series (event-calendar P2). ' +
      'Only valid on a series parent; a new/changed RRULE regenerates future, ' +
      'unregistered, non-detached occurrences (registered and individually-' +
      'edited occurrences are preserved).',
  })
  @IsOptional()
  @IsString()
  recurrenceRule?: string;
}

export class CancelEventDto {
  @ApiProperty({ example: 'Event cancelled due to unforeseen circumstances' })
  @IsString()
  reason: string;
}

export class CreateTicketTypeDto {
  @ApiProperty({ example: 'General Admission' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Standard entry ticket' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    enum: TicketKind,
    default: TicketKind.INDIVIDUAL,
    description: 'RSVP (one-click free), INDIVIDUAL, or GROUP.',
  })
  @IsOptional()
  @IsEnum(TicketKind)
  kind?: TicketKind;

  @ApiPropertyOptional({
    enum: GroupPricingMode,
    description: 'Required for GROUP tickets: flat per-group or per-person.',
  })
  @IsOptional()
  @IsEnum(GroupPricingMode)
  groupPricingMode?: GroupPricingMode;

  @ApiPropertyOptional({ example: 2, description: 'Min people (GROUP only).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minGroupSize?: number;

  @ApiPropertyOptional({ example: 5, description: 'Max people (GROUP only).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxGroupSize?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Optional capacity cap. Omit for unlimited.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @ApiPropertyOptional({ example: '2024-12-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @ApiPropertyOptional({ example: '2024-12-24T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Ids of other ticket types this ticket blocks: a user who holds this ' +
      'ticket cannot register for any listed here. Directional — the reverse ' +
      'is not implied.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  blocksTicketTypeIds?: string[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Queue buyers once this ticket sells out instead of turning them away. ' +
      'Requires totalQuantity — an unlimited ticket never sells out.',
  })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({
    example: 24,
    default: 24,
    description:
      'Hours someone let off the waiting list has to pay before the held ' +
      'seat is released back to the queue.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  waitlistOfferTtlHours?: number;

  @ApiPropertyOptional({
    example: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
    description:
      "WhatsApp group invite link specific to this ticket type. Takes " +
      'precedence over the event group for attendees on this ticket; validated ' +
      '+ normalised server-side. Empty string clears it.',
  })
  @IsOptional()
  @IsString()
  whatsappGroupUrl?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Listed on the event page. Hidden tickets cannot be bought.',
  })
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Open for registration.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ReorderTicketTypesDto {
  @ApiProperty({
    type: [String],
    description: 'Every ticket type id of the event, in the new display order.',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  ids: string[];
}

export class UpdateTicketTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: TicketKind })
  @IsOptional()
  @IsEnum(TicketKind)
  kind?: TicketKind;

  @ApiPropertyOptional({ enum: GroupPricingMode })
  @IsOptional()
  @IsEnum(GroupPricingMode)
  groupPricingMode?: GroupPricingMode;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  minGroupSize?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxGroupSize?: number;

  @ApiPropertyOptional({ description: 'Optional capacity cap; omit for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  saleStartsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  saleEndsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Ids of other ticket types this ticket blocks. Replaces the existing ' +
      'set when provided. Directional — the reverse is not implied.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  blocksTicketTypeIds?: string[];

  @ApiPropertyOptional({
    description:
      'Queue buyers once this ticket sells out. Requires totalQuantity.',
  })
  @IsOptional()
  @IsBoolean()
  waitlistEnabled?: boolean;

  @ApiPropertyOptional({
    example: 24,
    description:
      'Hours to pay before a held seat is released. Changing this affects ' +
      'future offers only; offers already made keep their original deadline.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  waitlistOfferTtlHours?: number;

  @ApiPropertyOptional({
    example: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
    description:
      "WhatsApp group invite link specific to this ticket type. Takes " +
      'precedence over the event group for attendees on this ticket; validated ' +
      '+ normalised server-side. undefined = leave as-is; empty string clears it.',
  })
  @IsOptional()
  @IsString()
  whatsappGroupUrl?: string;
}

export class CreateAgendaDto {
  @ApiProperty({ example: 'Opening Keynote' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Welcome address by CEO' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2024-12-25T10:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ example: '2024-12-25T11:00:00Z' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  speakerName?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateSpeakerDto {
  @ApiProperty({ example: 'Jane Smith' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Tech leader and innovator' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://avatar.url' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'CTO' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: 'TechCorp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/janesmith' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateAgendaDto {
  @ApiPropertyOptional({ example: 'Opening Keynote' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Welcome address by CEO' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '2024-12-25T10:00:00Z' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ example: '2024-12-25T11:00:00Z' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  speakerName?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateSpeakerDto {
  @ApiPropertyOptional({ example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Tech leader and innovator' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://avatar.url' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'CTO' })
  @IsOptional()
  @IsString()
  designation?: string;

  @ApiPropertyOptional({ example: 'TechCorp' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/janesmith' })
  @IsOptional()
  @IsUrl()
  linkedinUrl?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePrizeDto {
  @ApiProperty({ example: 'Grand Prize' })
  @IsString()
  @MaxLength(500)
  title: string;

  @ApiPropertyOptional({ example: 'Awarded to the winning team.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '1st Prize' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rank?: string;

  @ApiPropertyOptional({ example: '₹50,000' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdatePrizeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rank?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateContactDto {
  @ApiProperty({ example: 'Priya Sharma' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Event Coordinator' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @ApiPropertyOptional({ example: 'contact@event.com' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+91 98765 43210' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateFaqDto {
  @ApiProperty({ example: 'Is there parking available?' })
  @IsString()
  question: string;

  @ApiProperty({ example: 'Yes, free parking is available on-site.' })
  @IsString()
  answer: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class UpdateFaqDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreateFormFieldDto {
  @ApiPropertyOptional({
    example: 'ticket-type-uuid',
    description:
      'Ticket type this field belongs to. Omit for an event-wide field.',
  })
  @IsOptional()
  @IsString()
  ticketTypeId?: string;

  @ApiProperty({ example: 'Dietary Preference' })
  @IsString()
  label: string;

  @ApiProperty({ enum: FormFieldType, example: FormFieldType.SELECT })
  @IsEnum(FormFieldType)
  type: FormFieldType;

  @ApiPropertyOptional({ example: ['Vegetarian', 'Non-Vegetarian', 'Vegan'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'Group tickets only: ask this once for the whole team (true) instead of every member (false, default).',
  })
  @IsOptional()
  @IsBoolean()
  perGroup?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    example: 'Add your GitHub or portfolio',
    description: 'Shown under the question. For a SECTION, the note under its heading.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @ApiPropertyOptional({
    example: { maxLength: 200 },
    description:
      'Answer limits: minLength/maxLength, min/max, minDate/maxDate (YYYY-MM-DD), minPicks/maxPicks, scale (5|10), fileKinds (pdf|image|doc), maxSizeMb (1-10).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  config?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: { fieldId: 'earlier-question-uuid', anyOf: ['Yes'] },
    description: 'Show only when an earlier choice question is answered with one of `anyOf`. null clears it.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

export class UpdateFormFieldDto {
  @ApiPropertyOptional({ example: 'Dietary Preference' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ enum: FormFieldType })
  @IsOptional()
  @IsEnum(FormFieldType)
  type?: FormFieldType;

  @ApiPropertyOptional({ example: ['Vegetarian', 'Non-Vegetarian', 'Vegan'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'Group tickets only: ask this once for the whole team (true) instead of every member (false, default).',
  })
  @IsOptional()
  @IsBoolean()
  perGroup?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @ApiPropertyOptional({
    example: 'Add your GitHub or portfolio',
    description: 'Shown under the question. For a SECTION, the note under its heading.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  helpText?: string | null;

  @ApiPropertyOptional({
    example: { maxLength: 200 },
    description:
      'Answer limits: minLength/maxLength, min/max, minDate/maxDate (YYYY-MM-DD), minPicks/maxPicks, scale (5|10), fileKinds (pdf|image|doc), maxSizeMb (1-10).',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  config?: Record<string, unknown> | null;

  @ApiPropertyOptional({
    example: { fieldId: 'earlier-question-uuid', anyOf: ['Yes'] },
    description: 'Show only when an earlier choice question is answered with one of `anyOf`. null clears it.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  showIf?: { fieldId: string; anyOf: string[] } | null;
}

export class EventFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: EventType })
  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  spaceId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Include sub-events in the results. Sub-events are hidden from the main ' +
      'feed by default and only surface under their parent "big event".',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeSubEvents?: boolean;

  @ApiPropertyOptional({
    description:
      'Highlighted events for the homepage. No editorial `isFeatured` column ' +
      'exists yet, so this surfaces the most-registered upcoming events as a ' +
      'popularity proxy.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  featured?: boolean;

  @ApiPropertyOptional({
    description:
      'Events gaining traction: newest upcoming events first. Distinct from ' +
      '`featured`, which ranks purely by registration count.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  trending?: boolean;

  @ApiPropertyOptional({
    description: 'Only events with no paid ticket type (the price, not the unreliable isFree flag).',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  free?: boolean;
}

export class AddCoHostDto {
  @ApiProperty({ example: 'space-uuid', description: 'Space to invite as co-host.' })
  @IsString()
  spaceId: string;
}

/** Propose handing an event's ownership to one of its co-host spaces. */
export class RequestEventTransferDto {
  @ApiProperty({
    example: 'space-uuid',
    description:
      'The co-host space to offer ownership to. Must already be a co-host of ' +
      'this event.',
  })
  @IsUUID()
  toSpaceId: string;

  @ApiPropertyOptional({
    example: 'Handing the finals over to the robotics club to run and settle.',
    description: 'Optional note shown to the target co-host with the request.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Accept or decline a pending ownership-transfer offer. */
export class ReviewEventTransferDto {
  @ApiPropertyOptional({
    example: 'Happy to take it on.',
    description: 'Optional note recorded with the decision.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewNote?: string;
}

/** Ask another space to let its event be nested under your parent event. */
export class RequestSubEventAttachDto {
  @ApiProperty({
    example: 'child-event-uuid',
    description:
      'The co-host event to nest as a sub-event. Must be owned by another ' +
      'space that already co-hosts (or is co-hosted on) this parent.',
  })
  @IsUUID()
  eventId: string;

  @ApiPropertyOptional({
    example: 'We would love to feature your session under the main summit.',
    description: 'Optional note shown to the owning space with the request.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Accept or decline a pending sub-event attach request. */
export class ReviewSubEventAttachDto {
  @ApiPropertyOptional({
    example: 'Glad to be part of it.',
    description: 'Optional note recorded with the decision.',
  })
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
  @ApiProperty({ example: 'user-uuid', description: 'User to add to the event team.' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({
    enum: EventTeamRole,
    default: EventTeamRole.CREW,
    description:
      'Role to grant on this event. Defaults to CREW (on-the-ground check-in).',
  })
  @IsOptional()
  @IsEnum(EventTeamRole)
  roleCode?: EventTeamRole;
}
