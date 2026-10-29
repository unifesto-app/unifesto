import { BadRequestException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';

/** F2: timed asks to checked-in attendees, once per stage; feedback closes 7 days after the end. */
describe('feedback timing (F2)', () => {
  const H = 3_600_000;
  const build = (opts: { claimed?: number; endedHoursAgo?: number } = {}) => {
    const notify = jest.fn(async () => ({}));
    const prisma: any = {
      event: {
        // First stage (request) has one due event; the reminder stage has none.
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'ev-1', title: 'Fest', endDateTime: new Date(Date.now() - 3 * H) }])
          .mockResolvedValueOnce([]),
        updateMany: jest.fn(async () => ({ count: opts.claimed ?? 1 })),
        findUnique: jest.fn(async () => ({
          id: 'ev-1',
          title: 'Fest',
          feedbackEnabled: true,
          deletedAt: null,
          startDateTime: new Date(Date.now() - ((opts.endedHoursAgo ?? 3) + 2) * H),
          endDateTime: new Date(Date.now() - (opts.endedHoursAgo ?? 3) * H),
        })),
      },
      eventRegistration: {
        findMany: jest.fn(async () => [{ userId: 'u1' }, { userId: 'u2' }]),
        count: jest.fn(async () => 1),
      },
      groupSeat: { count: jest.fn(async () => 0) },
      eventGroupMemberCheckin: { findMany: jest.fn(async () => [{ groupSeat: { claimedByUserId: 'u3' } }]) },
      eventFeedbackResponse: { findMany: jest.fn(async () => [{ userId: 'u2' }]) },
      eventFeedbackQuestion: { findMany: jest.fn(async () => []) },
    };
    const svc = new FeedbackService(prisma, { notify } as any, { emit: jest.fn() } as any);
    return { svc, notify, prisma };
  };

  it('asks checked-in attendees and members who have not answered yet', async () => {
    const { svc, notify, prisma } = build();
    expect(await svc.sendDue()).toEqual({ sent: 2 });
    expect(notify.mock.calls.map((c: any[]) => [c[0], c[1]])).toEqual([
      ['u1', 'feedback.request'],
      ['u3', 'feedback.request'],
    ]);
    // The stage is claimed on the event before sending.
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: { id: 'ev-1', feedbackRequestedAt: null },
      data: { feedbackRequestedAt: expect.any(Date) },
    });
  });

  it('sends nothing when another replica already claimed the stage', async () => {
    const { svc, notify } = build({ claimed: 0 });
    expect(await svc.sendDue()).toEqual({ sent: 0 });
    expect(notify).not.toHaveBeenCalled();
  });

  it('closes 7 days after the event ends', async () => {
    const { svc } = build({ endedHoursAgo: 7 * 24 + 1 });
    await expect(svc.submit('u1', 'ev-1', { rating: 5 })).rejects.toThrow(
      new BadRequestException('Feedback for this event has closed'),
    );
  });
});
