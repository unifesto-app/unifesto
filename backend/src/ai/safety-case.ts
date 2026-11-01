import { RoleCode } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Who an AI safety case (AI3, AI19) is raised by: the longest-standing
 * platform admin, so the case stays staff-only and the organiser it is about
 * never sees it in My help. Null on a database without an admin; callers then
 * skip the case (and AI19 sends instead of holding).
 */
export async function staffRequesterId(prisma: PrismaService): Promise<string | null> {
  const role = await prisma.userRole.findFirst({
    where: { role: { code: RoleCode.ADMIN }, spaceId: null, eventId: null },
    orderBy: { user: { createdAt: 'asc' } },
    select: { userId: true },
  });
  return role?.userId ?? null;
}
