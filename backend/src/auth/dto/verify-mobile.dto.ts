import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class VerifyMobileDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Mobile number must be in E.164 format (e.g., +919876543210)',
  })
  mobileNumber: string;

  @IsString()
  @IsNotEmpty()
  otp: string;

  @IsString()
  @IsNotEmpty()
  tempToken: string; // Temporary token from initial auth
}
