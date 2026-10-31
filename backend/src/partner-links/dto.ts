import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePartnerLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsEmail()
  email: string;
}
