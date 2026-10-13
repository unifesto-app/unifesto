import { NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode, SpaceVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who may SEE a space. PUBLIC spaces: everyone. PRIVATE spaces ("only members
 * can view"): platform admins plus anyone holding a role in the space — any
 * space-scoped role (incl. plain MEMBER) or an event-scoped role on one of its
 * events. Shared by spaces and events so the rule lives once.
 */
export async function canViewSpace(
  prisma: PrismaService,
  space: { id: string; visibility: SpaceVisibility },
  viewerId?: string,
): Promise<boolean> {
  if (space.visibility !== SpaceVisibility.PRIVATE) return true;
  if (!viewerId) return false;
  const role = await prisma.userRole.findFirst({
    where: {
      userId: viewerId,
      OR: [
        { spaceId: space.id },
        { event: { spaceId: space.id } },
        { role: { code: RoleCode.ADMIN } },
      ],
    },
    select: { id: true },
  });
  return !!role;
}

/**
 * Throws 404 (not 403) for a private space the viewer can't see, so its
 * existence isn't revealed. Loads the space when only an id is given.
 */
export async function assertCanViewSpace(
  prisma: PrismaService,
  spaceOrId: string | { id: string; visibility: SpaceVisibility },
  viewerId?: string,
): Promise<void> {
  const space =
    typeof spaceOrId === 'string'
      ? await prisma.space.findUnique({
          where: { id: spaceOrId },
          select: { id: true, visibility: true },
        })
      : spaceOrId;
  if (!space || !(await canViewSpace(prisma, space, viewerId))) {
    throw new NotFoundException('Space not found');
  }
}

/**
 * Prisma filter for listings: public spaces, plus private ones the viewer
 * belongs to. Platform admins should skip this filter entirely.
 */
export function visibleSpacesWhere(viewerId?: string): Prisma.SpaceWhereInput {
  if (!viewerId) return { visibility: SpaceVisibility.PUBLIC };
  return {
    OR: [
      { visibility: SpaceVisibility.PUBLIC },
      { userRoles: { some: { userId: viewerId } } },
      { events: { some: { userRoles: { some: { userId: viewerId } } } } },
    ],
  };
}
