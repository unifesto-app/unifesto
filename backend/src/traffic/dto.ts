import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecordViewDto {
  @IsIn(['EVENT', 'SPACE'])
  target: 'EVENT' | 'SPACE';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id: string;

  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  visitorId: string;

  @IsIn(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaign?: string;
}

/** Website page-view beacon (K6). Visitor identity comes from the request, never the body. */
export class RecordWebViewDto {
  @IsString()
  @Matches(/^\//)
  @MaxLength(2000)
  path: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaign?: string;
}

export class TrafficRangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class CreateShortLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}

export class CreateSpaceShortLinkDto extends CreateShortLinkDto {
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class CreateAdminShortLinkDto extends CreateSpaceShortLinkDto {
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;
}
