import { IsString, IsNotEmpty, IsOptional, Matches, ValidateIf } from 'class-validator';

export class VerifyMobileDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Mobile number must be in E.164 format (e.g., +919876543210)',
  })
  mobileNumber: string;

  @ValidateIf((o) => !o.linkToken)
  @IsString()
  @IsNotEmpty()
  otp?: string;

  @IsString()
  @IsNotEmpty()
  tempToken: string; // Temporary token from initial auth

  /** Q33: from the PHONE_ON_OTHER_ACCOUNT 409, sent instead of `otp` to say "add this sign-in to that account". */
  @IsOptional()
  @IsString()
  linkToken?: string;
}
