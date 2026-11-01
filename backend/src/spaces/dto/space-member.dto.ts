import { IsEmail, IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { RoleCode } from '@prisma/client';

/** Space-scoped roles that can be assigned to a member. */
const SPACE_MEMBER_ROLES = [
  RoleCode.SPACE_ADMIN,
  RoleCode.MEMBER,
] as const;

/** Someone found in member search (`userId`), or (Q31) anyone by `email`, account or not. */
export class AddSpaceMemberDto {
  @ValidateIf((o) => !o.email)
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsEmail()
  email?: string;

  @IsEnum(RoleCode)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}

export class UpdateSpaceMemberRoleDto {
  @IsEnum(RoleCode)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}
