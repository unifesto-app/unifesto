import { Type } from 'class-transformer';
import {
  IsString,
  IsUrl,
  Matches,
  ValidateNested,
} from 'class-validator';

/** A dotted version like "2.0.1" (1–4 numeric segments). */
const VERSION_RE = /^\d+(\.\d+){0,3}$/;
/** Same, or empty: an empty latest version turns the soft update prompt off. */
const OPTIONAL_VERSION_RE = /^(\d+(\.\d+){0,3})?$/;

export class PlatformVersionDto {
  @IsString()
  @Matches(OPTIONAL_VERSION_RE, {
    message: 'latestVersion must be a dotted version like 2.1.0, or empty',
  })
  latestVersion: string;

  @IsString()
  @Matches(VERSION_RE, { message: 'minimumVersion must be a dotted version like 2.0.0' })
  minimumVersion: string;

  @IsUrl({ require_protocol: true })
  storeUrl: string;
}

export class UpdateAppVersionDto {
  @ValidateNested()
  @Type(() => PlatformVersionDto)
  ios: PlatformVersionDto;

  @ValidateNested()
  @Type(() => PlatformVersionDto)
  android: PlatformVersionDto;
}
