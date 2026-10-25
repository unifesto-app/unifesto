import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiProperty({ enum: ['EVENT', 'SPACE'] })
  @IsIn(['EVENT', 'SPACE'])
  target: 'EVENT' | 'SPACE';

  @ApiProperty({ description: 'Event or space id, or its slug' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id: string;

  @ApiProperty({ description: 'Anonymous id for this app install' })
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  visitorId: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform: 'ios' | 'android' | 'web';

  @ApiPropertyOptional({ description: 'utm_source of the link that opened the page' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  medium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaign?: string;
}

/** Website page-view beacon (K6). Visitor identity comes from the request, never the body. */
export class RecordWebViewDto {
  @ApiProperty({ example: '/event/tech-fest' })
  @IsString()
  @Matches(/^\//)
  @MaxLength(2000)
  path: string;

  @ApiPropertyOptional({ description: 'document.referrer; only its domain is kept' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  medium?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  campaign?: string;
}

export class TrafficRangeQuery {
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class CreateShortLinkDto {
  @ApiPropertyOptional({ example: 'Instagram bio' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({
    example: 'instagram',
    description: 'utm_source on the destination; registrations show up under it. Defaults to "link".',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  source?: string;
}

export class CreateSpaceShortLinkDto extends CreateShortLinkDto {
  @ApiPropertyOptional({ description: "Link to one of the space's events instead of the space page" })
  @IsOptional()
  @IsUUID()
  eventId?: string;
}

export class CreateAdminShortLinkDto extends CreateSpaceShortLinkDto {
  @ApiPropertyOptional({ description: 'Link to a space page' })
  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @ApiPropertyOptional({
    example: 'https://www.unifesto.app/blog/launch',
    description: 'Any https page on unifesto.app. Give exactly one of eventId, spaceId, url.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;
}
