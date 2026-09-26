import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

/** OneSignal ids are UUIDs; accept any 8–64 char id-safe string to stay SDK-proof. */
const ONESIGNAL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The mobile app reports its OneSignal push subscription (the "device id") after
 * sign-in / session restore / subscription change, so the backend can map
 * user ↔ devices and link the OneSignal external_id server-side.
 */
export class RegisterPushDeviceDto {
  @IsString()
  @Matches(ONESIGNAL_ID_RE, { message: 'subscriptionId must be a OneSignal subscription id' })
  subscriptionId: string;

  @IsOptional()
  @IsString()
  @Matches(ONESIGNAL_ID_RE, { message: 'oneSignalId must be a OneSignal user id' })
  oneSignalId?: string;

  @IsString()
  @IsIn(['ios', 'android'], { message: 'platform must be one of: ios, android' })
  platform: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  deviceModel?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  appVersion?: string;

  @IsBoolean()
  optedIn: boolean;
}
