import { Prisma, RoleCode } from '@prisma/client';

/**
 * Platform staff: users holding the platform ADMIN role (not scoped to a space
 * or event). The "Staff only" test audience on the Apex push, email and
 * WhatsApp consoles, so a test never goes to every user.
 */
export const PLATFORM_STAFF_WHERE: Prisma.UserWhereInput = {
  roles: { some: { role: { code: RoleCode.ADMIN }, spaceId: null, eventId: null } },
};
