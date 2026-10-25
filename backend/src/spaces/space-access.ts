import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, RoleCode, SpaceStatus, SpaceVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * "Publicly live" (J16), defined once: the space passed review and has not
 * been taken down. APPROVED is what Apex's approve button sets; ACTIVE is the
 * same state reached by the older paths (seed, sub-space approval, reactivation
 * requests), so both count. PENDING, REJECTED, INACTIVE, SUSPENDED and ARCHIVED
 * are off: no public listing or page, no publish, no new sales, no payout
 * requests. Operators keep read access to their own data and existing tickets
 * still check in.
 */
export const PUBLIC_SPACE_STATUSES: SpaceStatus[] = [SpaceStatus.APPROVED, SpaceStatus.ACTIVE];

export function isSpaceLive(status: SpaceStatus): boolean {
  return PUBLIC_SPACE_STATUSES.includes(status);
}

/** Where-fragment: the space is live. */
export const LIVE_SPACE_WHERE = { status: { in: PUBLIC_SPACE_STATUSES } } satisfies Prisma.SpaceWhereInput;

/** Where-fragment: anyone may see the space and what it hosts (live AND PUBLIC). */
export const PUBLIC_LIVE_SPACE_WHERE = {
  ...LIVE_SPACE_WHERE,
  visibility: SpaceVisibility.PUBLIC,
} satisfies Prisma.SpaceWhereInput;

/**
 * Spaces that still show in their operators' own switcher: live, or taken down
 * for now (INACTIVE/SUSPENDED), so they can still read attendees and money.
 */
export const OPERATOR_SPACE_STATUSES: SpaceStatus[] = [
  ...PUBLIC_SPACE_STATUSES,
  SpaceStatus.INACTIVE,
  SpaceStatus.SUSPENDED,
];

const UNAVAILABLE = { message: 'This space is temporarily unavailable', code: 'SPACE_UNAVAILABLE' };

/**
 * Refuse publish / sales / payout requests unless the space is live. `where`
 * picks the space (`{ id }`, or `{ events: { some: { id: eventId } } }`).
 * Applies to everyone, platform admins included: reinstate the space first.
 */
export async function assertSpaceLive(prisma: PrismaService, where: Prisma.SpaceWhereInput): Promise<void> {
  const space = await prisma.space.findFirst({ where, select: { status: true } });
  if (space && !isSpaceLive(space.status)) throw new ForbiddenException(UNAVAILABLE);
}

/** The error for a space the viewer may not see: 404 if private, else "temporarily unavailable". */
export function spaceHiddenError(space: { visibility: SpaceVisibility }) {
  return space.visibility === SpaceVisibility.PRIVATE
    ? new NotFoundException('Space not found')
    : new ForbiddenException(UNAVAILABLE);
}

/**
 * Who may SEE a space. PUBLIC live spaces: everyone. PRIVATE spaces ("only
 * members can view") and spaces that aren't live: platform admins plus anyone
 * holding a role in the space — any
 * space-scoped role (incl. plain MEMBER) or an event-scoped role on one of its
 * events. Shared by spaces and events so the rule lives once.
 */
export async function canViewSpace(
  prisma: PrismaService,
  space: { id: string; visibility: SpaceVisibility; status: SpaceStatus },
  viewerId?: string,
): Promise<boolean> {
  if (space.visibility !== SpaceVisibility.PRIVATE && isSpaceLive(space.status)) return true;
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
 * existence isn't revealed; 403 SPACE_UNAVAILABLE for a public space that
 * isn't live. Loads the space when only an id is given.
 */
export async function assertCanViewSpace(
  prisma: PrismaService,
  spaceOrId: string | { id: string; visibility: SpaceVisibility; status: SpaceStatus },
  viewerId?: string,
): Promise<void> {
  const space =
    typeof spaceOrId === 'string'
      ? await prisma.space.findUnique({
          where: { id: spaceOrId },
          select: { id: true, visibility: true, status: true },
        })
      : spaceOrId;
  if (!space) throw new NotFoundException('Space not found');
  if (!(await canViewSpace(prisma, space, viewerId))) throw spaceHiddenError(space);
}

/**
 * Prisma filter for listings: public live spaces, plus any the viewer belongs
 * to. Platform admins should skip this filter entirely.
 */
export function visibleSpacesWhere(viewerId?: string): Prisma.SpaceWhereInput {
  if (!viewerId) return PUBLIC_LIVE_SPACE_WHERE;
  return {
    OR: [
      PUBLIC_LIVE_SPACE_WHERE,
      { userRoles: { some: { userId: viewerId } } },
      { events: { some: { userRoles: { some: { userId: viewerId } } } } },
    ],
  };
}
