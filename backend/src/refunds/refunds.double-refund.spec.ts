import { ConflictException } from '@nestjs/common';
import { Prisma, RefundStatus } from '@prisma/client';
import { RefundsService } from './refunds.service';

/**
 * S11: approving a refund claims the request (PENDING_ADMIN -> PROCESSING)
 * before Razorpay is called, and refunded totals are incremented, never
 * overwritten. Two approvals of one request must move the money once.
 */

process.env.RAZORPAY_KEY_ID ??= 'rzp_test_x';
process.env.RAZORPAY_KEY_SECRET ??= 'secret';

const notFound = () => new Prisma.PrismaClientKnownRequestError('no match', { code: 'P2025', clientVersion: '6' });

function setup() {
  // ₹100 ticket + ₹5 fee, ₹40 already refunded.
  const registration = {
    id: 'reg-1',
    userId: 'holder',
    eventId: 'ev-1',
    totalAmount: 105,
    processingFee: 5,
    razorpayAmount: 105,
    refundedAmount: 40,
    paymentId: 'pay_1',
    groupSize: null,
    quantity: 1,
    ticketTypeId: null,
    event: { title: 'Fest' },
  };
  let status: RefundStatus = RefundStatus.PENDING_ADMIN;
  // Conditional update: matches only while the row is still in `where.status`.
  const update = jest.fn(async ({ where, data }: any) => {
    if (where.status && where.status !== status) throw notFound();
    status = data.status ?? status;
    return { id: 'rr-1', status };
  });
  const tx = {
    eventRegistration: { update: jest.fn(async () => ({})) },
    event: { update: jest.fn(async () => ({})) },
    eventTicketType: { update: jest.fn(async () => ({})) },
    eventTicket: { updateMany: jest.fn(async () => ({})) },
    groupSeatPurchase: { update: jest.fn(async () => ({})) },
    refundRequest: { update },
  };
  const prisma = {
    refundRequest: {
      // Both admins loaded the request while it was still PENDING_ADMIN.
      findUnique: jest.fn(async () => ({
        id: 'rr-1',
        status: RefundStatus.PENDING_ADMIN,
        eventId: 'ev-1',
        registrationId: 'reg-1',
        registration,
      })),
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
      update,
    },
    eventRegistration: {
      findUnique: jest.fn(async () => ({ ...registration, paymentStatus: 'PAID', event: { id: 'ev-1', status: 'PUBLISHED', title: 'Fest', createdBy: 'c', spaceId: 's' } })),
      findUniqueOrThrow: jest.fn(async () => registration),
    },
    groupSeatPurchase: { findMany: jest.fn(async () => []) },
    user: { findUnique: jest.fn(async () => ({ deletedAt: null })) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const payouts = { eventOverdrawn: jest.fn(async () => 0) };
  const service = new RefundsService(prisma as any, {} as any, { emit: jest.fn() } as any, {} as any, payouts as any);
  const s = service as any;
  const refund = jest.fn(async () => ({ id: 'rfnd_1' }));
  s.razorpay = { payments: { refund } };
  s.userContact = jest.fn(async () => ({ email: null, name: 'there' }));
  s.notifyEmail = jest.fn();
  s.notifyOtherPayers = jest.fn(async () => undefined);
  return { service, prisma, tx, refund, payouts, update, getStatus: () => status, setStatus: (v: RefundStatus) => (status = v) };
}

describe('refund approval is claimed before money moves (S11)', () => {
  it('a second approval of the same request is refused and Razorpay is called once', async () => {
    const { service, refund } = setup();
    await service.adminDecide('admin-a', 'rr-1', { action: 'APPROVE' } as any);
    await expect(service.adminDecide('admin-b', 'rr-1', { action: 'APPROVE' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith('pay_1', expect.objectContaining({ amount: 6000 }));
  });

  it('increments refundedAmount instead of writing an absolute figure', async () => {
    const { service, tx } = setup();
    await service.adminDecide('admin', 'rr-1', { action: 'APPROVE', approvedAmount: 20 } as any);
    const { data } = (tx.eventRegistration.update.mock.calls[0] as any)[0];
    expect(data.refundedAmount).toEqual({ increment: 20 });
  });

  it('a failed Razorpay call puts the request back in the admin queue', async () => {
    const { service, refund, getStatus } = setup();
    refund.mockRejectedValueOnce({ error: { description: 'gateway down' } });
    await expect(service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any)).rejects.toThrow('gateway down');
    expect(getStatus()).toBe(RefundStatus.PENDING_ADMIN);
  });

  it('once money moved, a failed DB write leaves the request PROCESSING for repair', async () => {
    const { service, prisma, getStatus } = setup();
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any)).rejects.toThrow('db down');
    expect(getStatus()).toBe(RefundStatus.PROCESSING);
  });

  it('an admin reject races a decision the same way', async () => {
    const { service, setStatus } = setup();
    setStatus(RefundStatus.APPROVED);
    await expect(service.adminDecide('admin', 'rr-1', { action: 'REJECT', note: 'no' } as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('a racing second open request (unique index) is a 409, not a 500', async () => {
    const { service, prisma } = setup();
    prisma.refundRequest.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }),
    );
    await expect(
      service.createRequest('holder', { registrationId: 'reg-1', reason: 'cannot attend' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('a refund landing after the event was paid out records the shortfall (S12)', async () => {
    const { service, payouts, update } = setup();
    // Not overdrawn before; ₹45 overdrawn once this ₹60 refund lands.
    payouts.eventOverdrawn.mockResolvedValueOnce(0).mockResolvedValueOnce(45);
    await service.adminDecide('admin', 'rr-1', { action: 'APPROVE' } as any);
    expect(update).toHaveBeenCalledWith({ where: { id: 'rr-1' }, data: { payoutShortfall: 45 } });
  });
});
