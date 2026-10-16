import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  eventReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  newEvents?: boolean;

  // Retired (referrals removed); still whitelisted so old clients sending it
  // are not 400d by forbidNonWhitelisted. Ignored.
  @IsOptional()
  @IsBoolean()
  referralUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  promotions?: boolean;

  @IsOptional()
  @IsBoolean()
  productUpdates?: boolean;

  // Category switches added by the notifications feature. These are
  // real columns on NotificationSettings; they must be whitelisted here or the
  // global ValidationPipe (forbidNonWhitelisted) rejects the whole PATCH with a
  // 400 the moment a client toggles one of them.
  @IsOptional()
  @IsBoolean()
  registrationUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  spaceUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  organiserAnnouncements?: boolean;
}
