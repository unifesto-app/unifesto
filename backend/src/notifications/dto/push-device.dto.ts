import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

/** OneSignal ids are UUIDs; accept any 8–64 char id-safe string to stay SDK-proof. */
const ONESIGNAL_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** APNs tokens are hex, FCM tokens use [A-Za-z0-9:_-]. It goes in the APNs URL path. */
const PUSH_TOKEN_RE = /^[A-Za-z0-9:_-]{32,512}$/;

/**
 * The mobile app reports its push install after sign-in / session restore /
 * subscription change, so the backend can map user ↔ devices. Old builds send
 * their OneSignal `subscriptionId` (linked to external_id server-side); builds
 * on native push send the APNs/FCM `token` (C12). One or the other.
 */
export class RegisterPushDeviceDto {
  @ValidateIf((o) => !o.token)
  @IsString()
  @Matches(ONESIGNAL_ID_RE, { message: 'subscriptionId must be a OneSignal subscription id' })
  subscriptionId?: string;

  @IsOptional()
  @IsString()
  @Matches(PUSH_TOKEN_RE, { message: 'token must be an APNs or FCM device token' })
  token?: string;

  /** iOS only: which APNs environment the build uses (expo-application's value). */
  @IsOptional()
  @IsIn(['development', 'production'], { message: 'apnsEnv must be development or production' })
  apnsEnv?: string;

  /** With `token`: this install's old OneSignal subscription, to delete so it gets no second copy. */
  @IsOptional()
  @IsString()
  @Matches(ONESIGNAL_ID_RE, { message: 'replacesSubscriptionId must be a OneSignal subscription id' })
  replacesSubscriptionId?: string;

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
