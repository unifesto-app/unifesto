import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Who an admin broadcast targets. `all` enumerates every user (pref-filtered at
 * send); `event` targets attendees of `eventId`; `space` targets members of
 * `spaceId`; `users` targets hand-picked accounts (`userIds`). Pref opt-out
 * (promotions default off) is always honoured downstream.
 */
export const MAX_DIRECT_PUSH_USERS = 100;

export class PushTargetDto {
  @IsIn(['all', 'event', 'space', 'users'])
  type: 'all' | 'event' | 'space' | 'users';

  // `event` targeting requires an eventId; skipped (and thus optional) otherwise.
  @ValidateIf((o) => o.type === 'event')
  @IsUUID()
  eventId?: string;

  // `space` targeting requires a spaceId; skipped (and thus optional) otherwise.
  @ValidateIf((o) => o.type === 'space')
  @IsUUID()
  spaceId?: string;

  // `users` targeting requires 1..MAX_DIRECT_PUSH_USERS user ids.
  @ValidateIf((o) => o.type === 'users')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DIRECT_PUSH_USERS)
  @IsUUID('all', { each: true })
  userIds?: string[];
}

export class CreatePushBroadcastDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushTargetDto)
  target: PushTargetDto;

  /**
   * Which category the broadcast sends under (drives pref opt-out):
   *  - `productUpdates` — app/product announcements, opt-OUT (reaches everyone
   *    who hasn't disabled it). Default.
   *  - `promotions` — marketing, opt-IN (reaches only users who enabled it).
   */
  @IsOptional()
  @IsIn(['productUpdates', 'promotions'])
  category?: 'productUpdates' | 'promotions';

  /** Optional deep link carried in the push data (e.g. unifesto://event/x). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;

  /** Extra structured data for the push payload. */
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  /** ISO timestamp; when set the campaign is scheduled instead of sent now. */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;
}

export class CreateOrganiserAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deepLink?: string;
}

export class ListPushCampaignsQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  status?: string[];
}
