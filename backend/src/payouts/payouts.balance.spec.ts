import { BillingModel, PaymentStatus } from '@prisma/client';
import { PayoutsService } from './payouts.service';

/**
 * S15 / S16: a partly refunded ticket still counts (net of the refund), a row
 * awaiting its automatic refund doesn't, and the platform fee comes from the
 * one shared rule, rounded to the paise.
 */
describe('PayoutsService event balance', () => {
  const regs = [
    { totalAmount: 102, processingFee: 2, refundedAmount: 0, paymentStatus: PaymentStatus.PAID },
    { totalAmount: 102, processingFee: 2, refundedAmount: 40, paymentStatus: PaymentStatus.PARTIALLY_REFUNDED },
  ];
  const build = () => {
    const prisma: any = {
      event: {
        findUnique: jest.fn(async () => ({
          spaceId: 'space-1',
          space: { subscription: { billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: null } },
        })),
      },
      eventRegistration: { findMany: jest.fn(async () => regs) },
      stayBooking: { findMany: jest.fn(async () => []) },
      groupSeatPurchase: { findMany: jest.fn(async () => []) },
      refundRequest: { findMany: jest.fn(async () => []) },
      payout: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
    };
    const planConfig = { resolvePlatformFeePercent: jest.fn(() => 5) };
    const svc = new PayoutsService(prisma, {} as any, {} as any, planConfig as any);
    return { svc, prisma, planConfig };
  };

  it('holds open refund requests out of the available balance (A25)', async () => {
    const { svc, prisma } = build();
    prisma.refundRequest.findMany.mockResolvedValue([
      // A failed refund still owed ₹40, and an unsized request on a ₹100 base.
      { requestedAmount: 40, registration: regs[0] },
      { requestedAmount: null, registration: regs[0] },
    ]);
    const summary = await svc.getEventPayoutSummary('event-1');
    expect(summary.eventNet).toBe(152); // what was earned is unchanged
    expect(summary.available).toBe(19); // (160 − 140) less 5% fee
    expect(prisma.refundRequest.findMany.mock.calls[0][0].where.status.in).toContain('REFUND_FAILED');
  });

  it('counts a partial refund net of what went back', async () => {
    const { svc } = build();
    const summary = await svc.getEventPayoutSummary('event-1');
    expect(summary.grossRevenue).toBe(160); // 100 + (100 − 40)
    expect(summary.estimatedPlatformFee).toBe(8);
    expect(summary.eventNet).toBe(152);
  });

  it('asks only for held money and skips rows awaiting an automatic refund', async () => {
    const { svc, prisma } = build();
    await svc.getEventPayoutSummary('event-1');
    expect(prisma.eventRegistration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          eventId: 'event-1',
          paymentStatus: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED] },
          refundDueAt: null,
        },
      }),
    );
  });

  it('takes the fee rule from plan config (null rate = model default, not 0%)', async () => {
    const { svc, planConfig } = build();
    await svc.getEventPayoutSummary('event-1');
    expect(planConfig.resolvePlatformFeePercent).toHaveBeenCalledWith({
      billingModel: BillingModel.REVENUE_SHARE,
      revenueSharePercent: null,
    });
  });
});
