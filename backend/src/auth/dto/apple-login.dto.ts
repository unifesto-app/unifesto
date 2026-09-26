import { IsString, IsNotEmpty } from 'class-validator';

export class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @IsString()
  @IsNotEmpty()
  authorizationCode: string;
}
