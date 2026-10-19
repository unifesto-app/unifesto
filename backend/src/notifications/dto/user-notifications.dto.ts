import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Which slice of the in-app feed: optionally one event and/or one type (or all but one). */
export class NotificationScopeQueryDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  type?: string;

  /** Everything except this type (ignored when `type` is set). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  excludeType?: string;
}

export class ListUserNotificationsQueryDto extends NotificationScopeQueryDto {
  /** Page backwards: only rows created before this instant. */
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** Mark specific rows read, or (without `ids`) everything in the scope. */
export class MarkNotificationsReadDto extends NotificationScopeQueryDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids?: string[];
}
