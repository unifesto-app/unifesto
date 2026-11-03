import { BadRequestException } from '@nestjs/common';
import { RefundsService } from './refunds.service';

/** A24: Apex "Refund all paid" sends what a cancelled event owes, and keeps going past a failure. */
function build(status: string) {
  const prisma: any = {
    event: { findUnique: jest.fn(async () => ({ id: 'ev-1', status, cancellationReason: 'Rain' })) },
    eventRegistration: { findMany: jest.fn(async () => []) },
    refundRequest: {
      updateMany: jest.fn(async () => ({ count: 0 })),
      createMany: jest.fn(async () => ({ count: 0 })),
      findMany: jest.fn(async () => [
        { id: 'rr-1', requestedAmount: null },
        { id: 'rr-2', requestedAmount: '40' },
      ]),
    },
  };
  const svc = new RefundsService(prisma, {} as any, { emit: jest.fn() } as any, {} as any, {} as any);
  const settle = jest
    .spyOn(svc as any, 'settleApprovedRefund')
    .mockImplementation(async (r: any) => {
      if (r.id === 'rr-1') throw new Error('card closed');
      return {};
    });
  return { svc, settle };
}

describe('refundCancelledEvent (A24)', () => {
  it('only runs on a cancelled event', async () => {
    const { svc } = build('PUBLISHED');
    await expect(svc.refundCancelledEvent('admin', 'ev-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('settles every open ticket request and reports failures', async () => {
    const { svc, settle } = build('CANCELLED');
    const out = await svc.refundCancelledEvent('admin', 'ev-1');
    expect(settle).toHaveBeenCalledTimes(2);
    expect(settle.mock.calls[1][2]).toBe(40); // a sized (e.g. failed) request sends what is owed
    expect(out).toEqual({
      refunded: 1,
      failed: [{ id: 'rr-1', error: 'card closed' }],
    });
  });
});
