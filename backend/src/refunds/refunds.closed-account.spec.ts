import { RefundStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';
import { REDACTED_REFUND_REASON } from '../common/account-deletion';

/**
 * Account close keeps the reason on a refund still in review; deciding it
 * then redacts the reason, but only when the holder's account is closed.
 */

process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET ??= 'secret';

function setup(holderDeletedAt: Date | null, status: RefundStatus) {
  const prisma = {
    refundRequest: {
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status,
        eventId: 'ev-1',
        registration: { userId: 'holder', eventId: 'ev-1', event: { title: 'Fest' } },
        event: { title: 'Fest' },
      })),
      update: jest.fn(async ({ data }: any) => data),
    },
    user: { findUnique: jest.fn(async () => ({ deletedAt: holderDeletedAt })) },
  };
  const service = new RefundsService(prisma as any, {} as any, { emit: jest.fn() } as any);
  const s = service as any;
  s.assertOrganiser = jest.fn(async () => undefined);
  s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
  s.notifyEmail = jest.fn();
  return { service, update: prisma.refundRequest.update };
}

describe('refund decisions for a closed account', () => {
  it('admin reject redacts the reason when the holder’s account is closed', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_ADMIN);
    await service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'late' } as any);
    expect(update.mock.calls[0][0].data.reason).toBe(REDACTED_REFUND_REASON);
  });

  it('curator reject redacts it too', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_CURATOR);
    await service.curatorReview('curator', 'rr-1', { action: 'REJECT', note: 'no' } as any);
    expect(update.mock.calls[0][0].data.reason).toBe(REDACTED_REFUND_REASON);
  });

  it('forwarding to admin keeps the reason (not decided yet)', async () => {
    const { service, update } = setup(new Date(), RefundStatus.PENDING_CURATOR);
    (service as any).notifyAdmin = jest.fn();
    await service.curatorReview('curator', 'rr-1', { action: 'FORWARD' } as any);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('reason');
  });

  it('leaves the reason alone for a live account', async () => {
    const { service, update } = setup(null, RefundStatus.PENDING_ADMIN);
    await service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'late' } as any);
    expect(update.mock.calls[0][0].data).not.toHaveProperty('reason');
  });
});
