import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Action } from '../../auth/authorization';

/** F4: suspend with an end date, or ban with none. */
export class SuspendUserDto {
  @ApiProperty({ description: 'Why, kept on the account and shown in Apex.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ description: 'ISO date the suspension ends. Omit or null to ban.' })
  @IsOptional()
  @IsISO8601()
  until?: string | null;
}

/** F4: one per-user exception to the role matrix. */
export class SetCapabilityOverrideDto {
  @ApiProperty({ enum: Object.values(Action) })
  @IsIn(Object.values(Action))
  action: Action;

  @ApiProperty({ description: 'true grants (space/event actions, one space), false takes it away.' })
  @IsBoolean()
  allow: boolean;

  @ApiPropertyOptional({ description: 'Limit to one space. Required to grant.' })
  @IsOptional()
  @IsUUID()
  spaceId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
