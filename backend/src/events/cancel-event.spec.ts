import { BadRequestException } from '@nestjs/common';
import { EventStatus, RefundStatus } from '@prisma/client';
import { EventsService } from './events.service';

/**
 * A24: cancelling only works on a live event, opens a refund request for every
 * paid booking (straight to Unifesto), tells attendees what actually happens,
 * and takes live sub-events with it.
 */
function build(opts: { claimed?: number; children?: { id: string }[] } = {}) {
  const event = { id: 'ev-1', spaceId: 'sp-1', slug: 'fest', title: 'Fest', startDateTime: new Date('2026-12-01') };
  const paidReg = {
    id: 'reg-paid', paymentStatus: 'PAID', razorpayAmount: 105, totalAmount: 105, processingFee: 5, refundedAmount: 0,
    user: { id: 'u-asha', fullName: 'Asha', username: null, identities: [{ email: 'asha@x.in' }] },
    // A teammate who joined the group (and the lead's own seat, deduped).
    groupSeats: [
      { claimedBy: { id: 'u-asha', fullName: 'Asha', username: null, identities: [{ email: 'asha@x.in' }] } },
      { claimedBy: { id: 'u-kiran', fullName: 'Kiran', username: null, identities: [{ email: 'kiran@x.in' }] } },
    ],
  };
  const freeReg = {
    id: 'reg-free', paymentStatus: 'PAID', razorpayAmount: 0, totalAmount: 0, processingFee: 0, refundedAmount: 0,
    user: { id: 'u-ravi', fullName: 'Ravi', username: null, identities: [{ email: 'ravi@x.in' }] },
  };
  let childCalls = 0;
  const prisma: any = {
    event: {
      findUnique: jest.fn(async ({ where }: any) => ({ ...event, id: where.id })),
      updateMany: jest.fn(async () => ({ count: opts.claimed ?? 1 })),
      findUniqueOrThrow: jest.fn(async () => ({ ...event, status: EventStatus.CANCELLED })),
      // Only the top-level event has children; the recursive call sees none.
      findMany: jest.fn(async () => (childCalls++ === 0 ? opts.children ?? [] : [])),
    },
    eventRegistration: {
      findMany: jest.fn(async ({ select }: any) => (select ? [{ id: paidReg.id, userId: 'u-asha' }] : [paidReg, freeReg])),
    },
    refundRequest: {
      findMany: jest.fn(async () => [{ id: 'rr-waiting', supportTicketId: null }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
      createManyAndReturn: jest.fn(async ({ data }: any) =>
        data.map((d: any, i: number) => ({ id: `rr-${i}`, registrationId: d.registrationId, status: d.status, supportTicketId: null })),
      ),
    },
  };
  const email: any = {
    sendRawEmail: jest.fn(async () => null),
    sendEventCancelled: jest.fn(async () => undefined),
  };
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const events = { emit: jest.fn() };
  const svc = new EventsService(prisma, {} as any, {} as any, cache, email, {} as any, events as any, {} as any, {} as any);
  jest.spyOn(svc, 'canManageEvent').mockResolvedValue(true);
  return { svc, prisma, email, events };
}

describe('cancelEvent (A24)', () => {
  it('refuses an event that is not published or ongoing (repeat cancel, completed)', async () => {
    const { svc, prisma, email } = build({ claimed: 0 });
    await expect(svc.cancelEvent('u-1', 'ev-1', { reason: 'Rain' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.event.updateMany.mock.calls[0][0].where.status.in).toEqual([EventStatus.PUBLISHED, EventStatus.ONGOING]);
    expect(prisma.refundRequest.createManyAndReturn).not.toHaveBeenCalled();
    expect(email.sendEventCancelled).not.toHaveBeenCalled();
  });

  it('opens a refund request per paid booking, straight to Unifesto', async () => {
    const { svc, prisma, email, events } = build();
    await svc.cancelEvent('u-1', 'ev-1', { reason: 'Rain' } as any);
    const { data, skipDuplicates } = prisma.refundRequest.createManyAndReturn.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      expect.objectContaining({ registrationId: 'reg-paid', status: RefundStatus.PENDING_ADMIN, reason: 'Event cancelled: Rain' }),
    ]);
    // Requests still waiting on the curator move to Unifesto too.
    expect(prisma.refundRequest.updateMany.mock.calls[0][0].data.status).toBe(RefundStatus.PENDING_ADMIN);
    // D6: each new request opens a CANCELLATION case with Unifesto; a moved one takes its case there.
    const sent = Object.fromEntries(events.emit.mock.calls.map(([name, e]: any) => [name, e]));
    expect(sent['assist.subject.open']).toMatchObject({
      subjectId: 'rr-0', kind: 'CANCELLATION', desk: 'PLATFORM', requesterId: 'u-asha', raisedForRequester: true,
    });
    expect(sent['assist.subject.update']).toMatchObject({ subjectId: 'rr-waiting', desk: 'PLATFORM' });
    // The desk hears about it.
    expect(email.sendRawEmail).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('1 refunds waiting'), expect.any(String));
  });

  it('tells paid attendees the ticket price comes back and the fee does not; free ones get no refund line', async () => {
    const { svc, email } = build();
    await svc.cancelEvent('u-1', 'ev-1', {} as any);
    const byEmail = Object.fromEntries(email.sendEventCancelled.mock.calls.map(([a]: any) => [a.email, a.refundInfo]));
    expect(byEmail['asha@x.in']).toMatch(/₹100 .*processing fee is not refunded/);
    expect(byEmail['ravi@x.in']).toBeUndefined();
  });

  it('mails only attending bookings, plus each joined group member once, without a refund line', async () => {
    const { svc, prisma, email } = build();
    await svc.cancelEvent('u-1', 'ev-1', {} as any);
    const query = prisma.eventRegistration.findMany.mock.calls.find(([a]: any) => a.include)[0];
    expect(query.where).toMatchObject({ isWaitlisted: false, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } });
    const sent = email.sendEventCancelled.mock.calls.map(([a]: any) => [a.email, a.refundInfo]);
    expect(sent.map(([e]: any) => e).sort()).toEqual(['asha@x.in', 'kiran@x.in', 'ravi@x.in']);
    expect(Object.fromEntries(sent)['kiran@x.in']).toBeUndefined();
  });

  it('cancels live sub-events with the parent', async () => {
    const { svc, prisma } = build({ children: [{ id: 'ev-child' }] });
    await svc.cancelEvent('u-1', 'ev-1', {} as any);
    expect(prisma.event.updateMany.mock.calls.map((c: any) => c[0].where.id)).toEqual(['ev-1', 'ev-child']);
  });
});
