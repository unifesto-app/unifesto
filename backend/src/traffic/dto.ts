import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const TARGETS = ['EVENT', 'SPACE'] as const;
const PLATFORMS = ['web', 'ios', 'android'] as const;

/** One view of a public event or space page, sent by the website or the app. */
export class TrackViewDto {
  @ApiProperty({ enum: TARGETS })
  @IsIn(TARGETS)
  target: (typeof TARGETS)[number];

  @ApiProperty({ description: 'Event or space slug (or id).' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  key: string;

  @ApiProperty({ description: 'Anonymous per-browser / per-install id.' })
  @Matches(/^[A-Za-z0-9_-]{8,64}$/)
  visitorId: string;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS)
  platform: (typeof PLATFORMS)[number];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) utmSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) utmMedium?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) utmCampaign?: string;

  @ApiPropertyOptional({ description: 'document.referrer (web).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  referrer?: string;
}

export class CreateShortLinkDto {
  @ApiProperty({ example: 'Instagram bio' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label: string;

  @ApiProperty({ example: 'instagram' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  utmSource: string;

  @ApiPropertyOptional({ example: 'social' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmMedium?: string;

  @ApiPropertyOptional({ example: 'launch-week' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  utmCampaign?: string;
}
