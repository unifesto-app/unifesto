import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

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

  /**
   * EAS Update runtime (fingerprint hash) the binary accepts updates for.
   * Optional: 4.0.x clients never send it.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  runtimeVersion?: string;

  /** Running OTA update id; omitted/null when the store build's own code runs. */
  @IsOptional()
  @IsUUID()
  updateId?: string | null;
}
