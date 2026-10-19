import { Action, AuthorizationService } from '../auth/authorization';
import { isAttending } from '../common/attendance';
import { PrismaService } from '../prisma/prisma.service';

/** The socket room for live engagement (polls now; Q&A, quizzes later) on one event. */
export const engagementRoom = (eventId: string) => `eng:${eventId}`;

/**
 * Who may follow an event's live engagement: anyone attending it, or its
 * operators (event:view covers curators, co-curators and crew). Shared by the
 * socket room and the HTTP feed so the two can never disagree.
 */
export async function canJoinEngagement(
  prisma: PrismaService,
  authz: AuthorizationService,
  eventId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  if (await isAttending(prisma, eventId, userId)) return true;
  return authz.can({ id: userId }, Action.EVENT_VIEW, { eventId });
}

/**
 * L4 projector: does this display link still open this event? The token is
 * per event, so a link for one event never opens another, and regenerating it
 * kills every old link. Read-only by construction: it only reaches the room's
 * data-free pings and the PII-free projector snapshot.
 */
export async function displayTokenMatches(
  prisma: PrismaService,
  eventId: string,
  token: unknown,
): Promise<boolean> {
  if (typeof token !== 'string' || token.length < 16) return false;
  return (await prisma.event.count({ where: { id: eventId, displayToken: token } })) > 0;
}
