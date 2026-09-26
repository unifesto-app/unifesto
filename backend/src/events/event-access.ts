import { EventVisibility, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SPACE_ONLY events are for members of the hosting space(s) — the owning space
 * plus any co-host. "Member" = any role in the space (incl. plain MEMBER) or an
 * event-scoped role on one of its events; platform admins see everything.
 * Everything else (PUBLIC, PRIVATE) is unaffected here.
 */

/** Space ids the viewer belongs to, or 'ALL' for a platform admin. */
export async function memberSpaceIds(
  prisma: PrismaService,
  viewerId?: string,
): Promise<string[] | 'ALL'> {
  if (!viewerId) return [];
  const roles = await prisma.userRole.findMany({
    where: { userId: viewerId },
    select: {
      spaceId: true,
      role: { select: { code: true } },
      event: { select: { spaceId: true } },
    },
  });
  if (roles.some((r) => r.role.code === RoleCode.ADMIN)) return 'ALL';
  const ids = new Set<string>();
  for (const r of roles) {
    if (r.spaceId) ids.add(r.spaceId);
    if (r.event?.spaceId) ids.add(r.event.spaceId);
  }
  return [...ids];
}

/** Listing filter: drop SPACE_ONLY events the viewer isn't a member for. */
export function spaceOnlyVisibleWhere(
  memberIds: string[] | 'ALL',
): Prisma.EventWhereInput {
  if (memberIds === 'ALL') return {};
  const notSpaceOnly: Prisma.EventWhereInput = {
    visibility: { not: EventVisibility.SPACE_ONLY },
  };
  if (memberIds.length === 0) return notSpaceOnly;
  return {
    OR: [
      notSpaceOnly,
      { spaceId: { in: memberIds } },
      { coHosts: { some: { spaceId: { in: memberIds } } } },
    ],
  };
}

/**
 * Filter for event LISTS shown to non-operators (a space's event list, a big
 * event's sub-events). PRIVATE means "only people with the link", so it is
 * never listed; the event page itself still opens by direct link. SPACE_ONLY
 * events are listed to members only.
 */
export function listableEventsWhere(
  memberIds: string[] | 'ALL',
): Prisma.EventWhereInput {
  return {
    AND: [
      { visibility: { not: EventVisibility.PRIVATE } },
      spaceOnlyVisibleWhere(memberIds),
    ],
  };
}

/**
 * May this viewer open / register for the event? Members of a hosting space
 * yes; anyone already holding a ticket or claimed group seat on it also yes,
 * so attendees registered before the event went space-only keep their pass.
 */
export async function canAccessSpaceOnlyEvent(
  prisma: PrismaService,
  event: { id: string; spaceId: string; visibility: EventVisibility },
  viewerId?: string,
): Promise<boolean> {
  if (event.visibility !== EventVisibility.SPACE_ONLY) return true;
  if (!viewerId) return false;

  const memberIds = await memberSpaceIds(prisma, viewerId);
  if (memberIds === 'ALL') return true;
  if (memberIds.length > 0) {
    if (memberIds.includes(event.spaceId)) return true;
    const coHost = await prisma.eventCoHost.findFirst({
      where: { eventId: event.id, spaceId: { in: memberIds } },
      select: { id: true },
    });
    if (coHost) return true;
  }

  const ticket = await prisma.eventRegistration.findFirst({
    where: {
      eventId: event.id,
      OR: [
        { userId: viewerId },
        { groupSeats: { some: { claimedByUserId: viewerId } } },
      ],
    },
    select: { id: true },
  });
  return !!ticket;
}
