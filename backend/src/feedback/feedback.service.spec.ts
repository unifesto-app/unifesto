import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

/** F1: attendees only, once the event started, one response each, curator questions enforced. */
describe('FeedbackService (F1)', () => {
  const build = (opts: { attending?: boolean; started?: boolean; enabled?: boolean } = {}) => {
    const { attending = true, started = true, enabled = true } = opts;
    const upsert = jest.fn(async (args: any) => args.create);
    const prisma: any = {
      event: {
        findUnique: jest.fn(async () => ({
          id: 'ev-1',
          title: 'Fest',
          feedbackEnabled: enabled,
          deletedAt: null,
          startDateTime: new Date(Date.now() + (started ? -1 : 1) * 3_600_000),
          endDateTime: new Date(Date.now() + 3_600_000),
        })),
      },
      eventRegistration: { count: jest.fn(async () => (attending ? 1 : 0)) },
      groupSeat: { count: jest.fn(async () => 0) },
      eventFeedbackQuestion: {
        findMany: jest.fn(async () => [
          { id: 'q1', label: 'Best talk', type: 'TEXT', options: [], isRequired: true, order: 0, config: null, showIf: null },
        ]),
      },
      eventFeedbackResponse: { upsert },
    };
    return { svc: new FeedbackService(prisma, { notify: jest.fn() } as any, { emit: jest.fn() } as any), upsert };
  };

  it('stores one response per attendee, keyed by event and user', async () => {
    const { svc, upsert } = build();
    await svc.submit('u1', 'ev-1', { rating: 4, nps: 9, comment: ' Great ', answers: { q1: 'Keynote' } });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: 'ev-1', userId: 'u1' } },
        create: expect.objectContaining({ rating: 4, nps: 9, comment: 'Great', answers: { q1: 'Keynote' } }),
      }),
    );
  });

  it('enforces required curator questions', async () => {
    const { svc } = build();
    await expect(svc.submit('u1', 'ev-1', { rating: 4 })).rejects.toThrow('Best talk is required.');
  });

  it('refuses non-attendees, events not started yet, and switched-off feedback', async () => {
    await expect(build({ attending: false }).svc.submit('u1', 'ev-1', { rating: 5, answers: { q1: 'x' } })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ started: false }).svc.submit('u1', 'ev-1', { rating: 5, answers: { q1: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build({ enabled: false }).svc.submit('u1', 'ev-1', { rating: 5, answers: { q1: 'x' } })).rejects.toBeInstanceOf(BadRequestException);
  });
});
