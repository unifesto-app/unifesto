import type { PrismaService } from '../prisma/prisma.service';

/** F3: below this many responses an average says more about one person than the event. */
export const PUBLIC_RATING_MIN = 5;

/**
 * The public rating for an event page: average of 1-5 and how many rated,
 * only when the curators opted in and at least PUBLIC_RATING_MIN people did.
 */
export async function publicRating(
  prisma: Pick<PrismaService, 'eventFeedbackResponse'>,
  event: { id: string; feedbackPublic: boolean },
): Promise<{ average: number; count: number } | null> {
  if (!event.feedbackPublic) return null;
  const agg = await prisma.eventFeedbackResponse.aggregate({
    where: { eventId: event.id },
    _avg: { rating: true },
    _count: true,
  });
  if (agg._count < PUBLIC_RATING_MIN || agg._avg.rating == null) return null;
  return { average: Math.round(agg._avg.rating * 10) / 10, count: agg._count };
}
