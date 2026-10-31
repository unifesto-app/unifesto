import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

/** D25: a grievance from the public page, proven by the email sign-in code. */
export class CreateGrievanceDto {
  @IsEmail()
  email: string;

  @IsString()
  @Length(4, 10)
  otp: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;
}
