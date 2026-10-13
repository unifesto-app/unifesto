import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// S29: inline `{ ... }` body types skip the global ValidationPipe entirely.

export class CognitoLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;
}

export class VerifyEmailOtpDto {
  // Not @IsEmail: keep accepting whatever the OTP was sent to; the OTP check decides.
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  otp: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken: string;
}
