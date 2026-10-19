import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** D25: a grievance from the public page, proven by the email sign-in code. */
export class CreateGrievanceDto {
  @ApiProperty({ example: 'me@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'The code sent by POST /auth/email' })
  @IsString()
  @Length(4, 10)
  otp: string;

  @ApiProperty({ example: 'My refund request was not handled' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subject: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;
}
