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
    user: { fullName: 'Asha', username: null, identities: [{ email: 'asha@x.in' }] },
  };
  const freeReg = {
    id: 'reg-free', paymentStatus: 'PAID', razorpayAmount: 0, totalAmount: 0, processingFee: 0, refundedAmount: 0,
    user: { fullName: 'Ravi', username: null, identities: [{ email: 'ravi@x.in' }] },
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
      findMany: jest.fn(async ({ select }: any) => (select ? [{ id: paidReg.id }] : [paidReg, freeReg])),
    },
    refundRequest: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
    },
  };
  const email: any = {
    sendRawEmail: jest.fn(async () => null),
    sendEventCancelled: jest.fn(async () => undefined),
  };
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const svc = new EventsService(prisma, {} as any, {} as any, cache, email, {} as any, {} as any, {} as any, {} as any);
  jest.spyOn(svc, 'canManageEvent').mockResolvedValue(true);
  return { svc, prisma, email };
}

describe('cancelEvent (A24)', () => {
  it('refuses an event that is not published or ongoing (repeat cancel, completed)', async () => {
    const { svc, prisma, email } = build({ claimed: 0 });
    await expect(svc.cancelEvent('u-1', 'ev-1', { reason: 'Rain' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.event.updateMany.mock.calls[0][0].where.status.in).toEqual([EventStatus.PUBLISHED, EventStatus.ONGOING]);
    expect(prisma.refundRequest.createMany).not.toHaveBeenCalled();
    expect(email.sendEventCancelled).not.toHaveBeenCalled();
  });

  it('opens a refund request per paid booking, straight to Unifesto', async () => {
    const { svc, prisma, email } = build();
    await svc.cancelEvent('u-1', 'ev-1', { reason: 'Rain' } as any);
    const { data, skipDuplicates } = prisma.refundRequest.createMany.mock.calls[0][0];
    expect(skipDuplicates).toBe(true);
    expect(data).toEqual([
      expect.objectContaining({ registrationId: 'reg-paid', status: RefundStatus.PENDING_ADMIN, reason: 'Event cancelled: Rain' }),
    ]);
    // Requests still waiting on the curator move to Unifesto too.
    expect(prisma.refundRequest.updateMany.mock.calls[0][0].data.status).toBe(RefundStatus.PENDING_ADMIN);
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

  it('cancels live sub-events with the parent', async () => {
    const { svc, prisma } = build({ children: [{ id: 'ev-child' }] });
    await svc.cancelEvent('u-1', 'ev-1', {} as any);
    expect(prisma.event.updateMany.mock.calls.map((c: any) => c[0].where.id)).toEqual(['ev-1', 'ev-child']);
  });
});
