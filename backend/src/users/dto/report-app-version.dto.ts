import { IsIn, IsString, Matches } from 'class-validator';

/** A dotted version like "2.0.1" (1–4 numeric segments). Mirrors the policy DTO. */
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

/**
 * The mobile app self-reports the installed build so staff can see which version
 * each account is running. Best-effort: a malformed payload is rejected rather
 * than persisted, but the app never blocks on the result.
 */
export class ReportAppVersionDto {
  @IsString()
  @Matches(VERSION_RE, {
    message: 'version must be a dotted version like 2.1.0',
  })
  version: string;

  @IsString()
  @IsIn(['ios', 'android', 'web'], {
    message: 'platform must be one of: ios, android, web',
  })
  platform: string;
}
