import { IsEmail, IsIn, IsUUID, ValidateIf } from 'class-validator';
import { RoleCode } from '@prisma/client';

/** Space-scoped roles that can be assigned to a member. Never ADMIN (T12). */
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

  @IsIn(SPACE_MEMBER_ROLES)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}

export class UpdateSpaceMemberRoleDto {
  @IsIn(SPACE_MEMBER_ROLES)
  role: (typeof SPACE_MEMBER_ROLES)[number];
}
