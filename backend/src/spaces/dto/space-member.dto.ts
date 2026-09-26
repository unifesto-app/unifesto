import { IsEnum, IsUUID } from 'class-validator';
import { RoleCode } from '@prisma/client';

/** Space-scoped roles that can be assigned to a member. */
const SPACE_MEMBER_ROLES = [
  RoleCode.SPACE_ADMIN,
  RoleCode.MEMBER,
] as const;

export class AddSpaceMemberDto {
  @IsUUID()
  userId: string;

  @IsEnum(RoleCode)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}

export class UpdateSpaceMemberRoleDto {
  @IsEnum(RoleCode)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}
