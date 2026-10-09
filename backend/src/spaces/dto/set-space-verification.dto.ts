import { IsBoolean } from 'class-validator';

export class SetSpaceVerificationDto {
  @IsBoolean()
  verified: boolean;
}
