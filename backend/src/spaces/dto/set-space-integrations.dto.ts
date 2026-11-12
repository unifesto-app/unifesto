import { IsBoolean } from 'class-validator';

export class SetSpaceIntegrationsDto {
  @IsBoolean()
  enabled: boolean;
}
