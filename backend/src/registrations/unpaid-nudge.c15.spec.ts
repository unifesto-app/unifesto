import { RegistrationPaymentsService, UNPAID_NUDGE_AFTER_MS } from './registration-payments.service';

describe('Unpaid checkout nudge (C15)', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const build = (rows: any[], paidElsewhere: Record<string, number> = {}) => {
    const prisma: any = {
      eventRegistration: {
        findMany: jest.fn().mockResolvedValue(rows),
        count: jest.fn(async ({ where }: any) => paidElsewhere[where.userId] ?? 0),
      },
    };
    const notify = { notify: jest.fn().mockResolvedValue({ push: 'sent' }) };
    const svc = new RegistrationPaymentsService(prisma, ...(Array(9).fill({}) as []), notify as any);
    return { svc, prisma, notify };
  };
  const row = (id: string, userId: string) => ({ id, userId, eventId: 'e1', event: { title: 'Hack Night', slug: 'hack-night' } });

  it('nudges the attendee once per unpaid checkout, opening the event page to buy again', async () => {
    const { svc, notify } = build([row('r1', 'u1')]);
    await expect(svc.nudgeUnpaidCheckouts(now)).resolves.toBe(1);
    expect(notify.notify).toHaveBeenCalledWith('u1', 'checkout.unpaid', {
      registrationId: 'r1',
      eventId: 'e1',
      eventSlug: 'hack-night',
      eventTitle: 'Hack Night',
    });
  });

  it("looks only at the attendee's own checkouts, unpaid 45 to 75 minutes, for events still ahead", async () => {
    const { svc, prisma } = build([]);
    await svc.nudgeUnpaidCheckouts(now);
    const where = prisma.eventRegistration.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      paymentStatus: 'PENDING',
      status: { not: 'CANCELLED' },
      waitlistStatus: null,
      orderId: { not: null },
      paymentLinkId: null,
      event: { status: 'PUBLISHED', startDateTime: { gt: now } },
    });
    expect(now.getTime() - where.createdAt.lte.getTime()).toBe(UNPAID_NUDGE_AFTER_MS);
    expect(where.createdAt.lte.getTime() - where.createdAt.gt.getTime()).toBe(30 * 60_000);
  });

  it('skips someone who has since paid for the event', async () => {
    const { svc, notify } = build([row('r1', 'u1'), row('r2', 'u2')], { u1: 1 });
    await expect(svc.nudgeUnpaidCheckouts(now)).resolves.toBe(1);
    expect(notify.notify.mock.calls.map((c: any) => c[0])).toEqual(['u2']);
  });
});
