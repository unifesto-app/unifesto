import { IsEmail, IsNotEmpty } from 'class-validator';

export class EmailLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
