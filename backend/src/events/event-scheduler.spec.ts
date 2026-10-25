import { EventSchedulerService, reminderRecipients, startingSoonWindow } from './event-scheduler.service';

describe('auto-complete leaves series parents alone (A29)', () => {
  it('only completes non-recurring events', async () => {
    const prisma = { event: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const redis = { runExclusive: jest.fn(async (_k: string, _t: number, task: () => Promise<void>) => task()) };
    const svc = new EventSchedulerService(prisma as any, {} as any, redis as any);
    await svc.markCompletedEvents();
    expect(prisma.event.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ isRecurring: false }),
      data: { status: 'COMPLETED' },
    });
  });
});

describe('reminders reach attending bookings and joined group members (C9)', () => {
  const person = (id: string, email: string) => ({ id, fullName: id, username: null, identities: [{ email }] });

  it('reads only attending bookings, so abandoned checkouts get no QR', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'ev-1', startDateTime: new Date(), endDateTime: new Date() }]) },
      eventRegistration: { findMany },
    };
    const redis = { setNx: jest.fn().mockResolvedValue(true) };
    await new EventSchedulerService(prisma as any, {} as any, redis as any).sendEventReminders();
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      eventId: 'ev-1',
      isWaitlisted: false,
      paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
    });
  });

  it('gives the lead the booking QR and each member their own seat ticket', () => {
    const out = reminderRecipients({
      userId: 'lead',
      qrCode: 'QR-GROUP',
      user: person('lead', 'lead@x.in'),
      tickets: [
        { ticketCode: 'T-LEAD', qrCode: 'QR-T1', attendeeEmail: null },
        { ticketCode: 'T-MEM', qrCode: 'QR-MEM', attendeeEmail: 'Mem@x.in' },
      ],
      groupSeats: [
        { claimedBy: person('lead', 'lead@x.in') },
        { claimedBy: person('mem', 'mem@x.in') },
        { claimedBy: person('noticket', 'none@x.in') },
      ],
    });
    expect(out.map((r) => [r.email, r.qrCode, r.ticketCode])).toEqual([
      ['lead@x.in', 'QR-GROUP', 'T-LEAD'],
      ['mem@x.in', 'QR-MEM', 'T-MEM'],
    ]);
  });
});

describe('starting-soon window covers every start minute exactly once (J2)', () => {
  it('over a simulated day of 15-minute runs (with run-time jitter)', () => {
    const t0 = Date.UTC(2026, 9, 25, 0, 0);
    const runs = Array.from({ length: 96 }, (_, i) => startingSoonWindow(new Date(t0 + i * 15 * 60_000 + (i % 7) * 1000)));
    // Every start minute between the first and last covered hour, plus odd seconds.
    for (let m = 60; m < 24 * 60 + 60 - 15; m++) {
      for (const sec of [0, 29]) {
        const start = t0 + m * 60_000 + sec * 1000;
        const hits = runs.filter((w) => start >= w.gte.getTime() && start < w.lt.getTime());
        expect(hits).toHaveLength(1);
      }
    }
  });
});
