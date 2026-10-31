import { IsBoolean } from 'class-validator';

export class SetEmployeeDto {
  @IsBoolean()
  enabled: boolean;
}
