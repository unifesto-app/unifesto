import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetEmployeeDto {
  @ApiProperty({ description: 'true makes the user an Employee, false removes it' })
  @IsBoolean()
  enabled: boolean;
}
