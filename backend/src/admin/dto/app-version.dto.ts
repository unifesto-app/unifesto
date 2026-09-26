import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsUrl,
  Matches,
  ValidateNested,
} from 'class-validator';

/** A dotted version like "2.0.1" (1–4 numeric segments). */
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

export class PlatformVersionDto {
  @ApiProperty({ example: '2.1.0', description: 'Latest version live in the store.' })
  @IsString()
  @Matches(VERSION_RE, { message: 'latestVersion must be a dotted version like 2.1.0' })
  latestVersion: string;

  @ApiProperty({
    example: '2.0.0',
    description: 'Oldest version still allowed to run (below it → forced update).',
  })
  @IsString()
  @Matches(VERSION_RE, { message: 'minimumVersion must be a dotted version like 2.0.0' })
  minimumVersion: string;

  @ApiProperty({ example: 'https://apps.apple.com/...', description: 'Store URL to update.' })
  @IsUrl({ require_protocol: true })
  storeUrl: string;
}

export class UpdateAppVersionDto {
  @ApiProperty({ type: PlatformVersionDto })
  @ValidateNested()
  @Type(() => PlatformVersionDto)
  ios: PlatformVersionDto;

  @ApiProperty({ type: PlatformVersionDto })
  @ValidateNested()
  @Type(() => PlatformVersionDto)
  android: PlatformVersionDto;
}
