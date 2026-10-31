import { IsBoolean, IsEnum, IsString } from 'class-validator';
import { RoleCode } from '@prisma/client';

/**
 * Toggle a single (role, action) grant in the capability matrix. `action` is an
 * `Action` value (e.g. "space:manage-billing"); it is validated as a string
 * here and scope-checked against the role in CapabilityConfigService.setGrant.
 */
export class SetGrantDto {
  @IsEnum(RoleCode)
  code!: RoleCode;

  @IsString()
  action!: string;

  @IsBoolean()
  granted!: boolean;
}
