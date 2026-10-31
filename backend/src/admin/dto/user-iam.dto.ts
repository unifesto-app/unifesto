import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Action } from '../../auth/authorization';

/** F4: suspend with an end date, or ban with none. */
export class SuspendUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;

  @IsOptional()
  @IsISO8601()
  until?: string | null;
}

/** F4: one per-user exception to the role matrix. */
export class SetCapabilityOverrideDto {
  @IsIn(Object.values(Action))
  action: Action;

  @IsBoolean()
  allow: boolean;

  @IsOptional()
  @IsUUID()
  spaceId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
