import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventVisibility, Prisma, RoleCode } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import type { AuthorizationService } from '../auth/authorization/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SPACE_ONLY events are for members of the hosting space(s) — the owning space
 * plus any co-host. "Member" = any role in the space (incl. plain MEMBER) or an
 * event-scoped role on one of its events; platform admins see everything.
 * Everything else (PUBLIC, PRIVATE) is unaffected here.
 */

/**
 * A co-host link counts only once the invited space accepted it (F8). Spread
 * into every `eventCoHost` / `coHosts: { some }` read that grants access,
 * lists or credits; a pending invite grants nothing.
 */
export const ACCEPTED_CO_HOST = {
  acceptedAt: { not: null },
} satisfies Prisma.EventCoHostWhereInput;

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
      { coHosts: { some: { spaceId: { in: memberIds }, ...ACCEPTED_CO_HOST } } },
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
      where: { eventId: event.id, spaceId: { in: memberIds }, ...ACCEPTED_CO_HOST },
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

/**
 * The Event columns a public card may carry: GET /events, a space's public
 * list, favourites (J9). An allow-list, so a new column stays private until
 * someone adds it here. Left out on purpose: the join link (`onlineUrl`, only
 * for operators and ticket holders), the attendee WhatsApp group, payout
 * routing, the projector `displayToken`, `createdBy` and housekeeping columns.
 */
export const PUBLIC_EVENT_CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  description: true,
  coverImageUrl: true,
  type: true,
  registrationType: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  venueName: true,
  venueAddress: true,
  city: true,
  state: true,
  country: true,
  latitude: true,
  longitude: true,
  onlinePlatform: true,
  capacity: true,
  registeredCount: true,
  waitlistEnabled: true,
  waitlistCount: true,
  isFree: true,
  absorbProcessingFee: true,
  tags: true,
  category: true,
  categories: true,
  visibility: true,
  status: true,
  whiteLabelEnabled: true,
  brandColor: true,
  brandLogoUrl: true,
  isRecurring: true,
  seriesParentId: true,
  parentEventId: true,
  spaceId: true,
  publishedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

/** Columns never sent on the public event detail, cached or not (J9). */
export const PRIVATE_EVENT_DETAIL_FIELDS = [
  'whatsappAttendeeGroupUrl',
  'payoutBankAccountId',
  'displayToken',
  'deletedBy',
  'formUploadsPurgedAt',
] as const;

type EventWith<S extends Prisma.EventSelect> = Prisma.EventGetPayload<{
  select: S & { id: true; spaceId: true };
}>;

/**
 * The one capability gate for event operations: loads the event (with `select`
 * merged over id + spaceId) or 404s, then 403s with `message` unless the user
 * may perform `action` on it (curators directly, Space and Platform Admins by
 * inheritance — see AuthorizationService).
 */
export async function assertEventCan<S extends Prisma.EventSelect>(
  prisma: PrismaService,
  authz: AuthorizationService,
  userId: string,
  eventId: string,
  action: Action,
  message: string,
  select?: S,
): Promise<EventWith<S>> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { ...select, id: true, spaceId: true },
  });
  if (!event) throw new NotFoundException('Event not found');
  if (!(await authz.can({ id: userId }, action, { eventId }))) {
    throw new ForbiddenException(message);
  }
  return event as unknown as EventWith<S>;
}

/** Whether the user holds the platform ADMIN role. */
export async function isPlatformAdmin(prisma: PrismaService, userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const count = await prisma.userRole.count({
    where: { userId, role: { code: RoleCode.ADMIN } },
  });
  return count > 0;
}
