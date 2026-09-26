import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsString } from 'class-validator';
import { RoleCode } from '@prisma/client';

/**
 * Toggle a single (role, action) grant in the capability matrix. `action` is an
 * `Action` value (e.g. "space:manage-billing"); it is validated as a string
 * here and scope-checked against the role in CapabilityConfigService.setGrant.
 */
export class SetGrantDto {
  @ApiProperty({ enum: RoleCode, description: 'Role whose grant is changing' })
  @IsEnum(RoleCode)
  code!: RoleCode;

  @ApiProperty({ example: 'event:publish', description: 'Action key to toggle' })
  @IsString()
  action!: string;

  @ApiProperty({ description: 'true to grant, false to revoke' })
  @IsBoolean()
  granted!: boolean;
}
