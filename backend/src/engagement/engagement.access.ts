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
