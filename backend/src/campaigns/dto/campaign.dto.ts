import { PickType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  Max,
  Min,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** push = push with its in-app copy; inapp = the in-app copy only. */
export const CAMPAIGN_CHANNELS = ['push', 'inapp', 'email', 'whatsapp'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const AUDIENCE_TYPES = ['all', 'space', 'event', 'not_checked_in', 'waitlist', 'organisers', 'staff', 'users'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

/** Audiences of one event: the only ones a campaign can be timed to. */
export const EVENT_AUDIENCES: ReadonlySet<AudienceType> = new Set(['event', 'not_checked_in', 'waitlist']);

/** How far from the event's start a timed campaign may go: a week before to three days after. */
export const OFFSET_MIN = -7 * 24 * 60;
export const OFFSET_MAX = 3 * 24 * 60;

export const MAX_PICKED_USERS = 500;

export class CampaignAudienceDto {
  @IsIn(AUDIENCE_TYPES)
  type!: AudienceType;

  @ValidateIf((o) => o.type === 'space')
  @IsUUID()
  spaceId?: string;

  @ValidateIf((o) => EVENT_AUDIENCES.has(o.type))
  @IsUUID()
  eventId?: string;

  @ValidateIf((o) => o.type === 'users')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PICKED_USERS)
  @IsUUID('all', { each: true })
  userIds?: string[];
}

/** Push and the in-app copy share these words. */
export class CampaignPushContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;
}

export class CampaignEmailContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  subject!: string;

  /** Sanitised by the email campaign engine before it is stored. */
  @IsString()
  @MinLength(1)
  @MaxLength(200_000)
  html!: string;
}

/** WhatsApp only carries an approved Meta template and its variables. */
export class CampaignWhatsappContentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  templateName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  languageCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  bodyParams?: string[];
}

const wants = (o: { channels?: string[] }, ...channels: CampaignChannel[]) =>
  channels.some((c) => o.channels?.includes(c));

/** The message: which channels, and the words for each. */
export class CampaignMessageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CAMPAIGN_CHANNELS, { each: true })
  channels!: CampaignChannel[];

  /** productUpdates (on unless switched off) or promotions (only to those who opted in). */
  @IsOptional()
  @IsIn(['productUpdates', 'promotions'])
  category?: 'productUpdates' | 'promotions';

  @ValidateIf((o) => wants(o, 'push', 'inapp'))
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignPushContentDto)
  push?: CampaignPushContentDto;

  @ValidateIf((o) => wants(o, 'email'))
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignEmailContentDto)
  email?: CampaignEmailContentDto;

  @ValidateIf((o) => wants(o, 'whatsapp'))
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignWhatsappContentDto)
  whatsapp?: CampaignWhatsappContentDto;
}

export class CreateCampaignDto extends CampaignMessageDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CampaignAudienceDto)
  audience!: CampaignAudienceDto;

  /** Later instead of now. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  /**
   * Timed to the event instead: minutes from its start, negative before
   * (-120 = 2 hours before). Moves when the event moves. Needs an event audience.
   */
  @ValidateIf((o) => o.offsetMinutes !== undefined)
  @IsInt()
  @Min(OFFSET_MIN)
  @Max(OFFSET_MAX)
  offsetMinutes?: number;

  /** The one line an AI draft started from. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brief?: string;
}

/** The approved template a WhatsApp draft fills: its body and how many variables it has. */
export class DraftWhatsappTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  bodyText!: string;

  @IsInt()
  @Min(0)
  @Max(20)
  paramCount!: number;
}

/** Write with AI: the sender's one line, the channels to draft, and the event it's about. */
export class DraftCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  line!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(CAMPAIGN_CHANNELS, { each: true })
  channels!: CampaignChannel[];

  @IsOptional()
  @IsUUID()
  eventId?: string;

  @ValidateIf((o) => wants(o, 'whatsapp'))
  @IsObject()
  @ValidateNested()
  @Type(() => DraftWhatsappTemplateDto)
  whatsapp?: DraftWhatsappTemplateDto;
}

/** Per-channel counts for the confirm step (WhatsApp needs the template for its consent rule). */
export class CampaignCountDto extends PickType(CreateCampaignDto, ['audience', 'channels', 'category', 'whatsapp'] as const) {}

export class TestCampaignDto extends CampaignMessageDto {}
