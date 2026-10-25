import { BillingModel, Prisma } from '@prisma/client';
import { maskUpiId, PayoutsService } from './payouts.service';
import { NOT_DEMO_EVENT, NOT_DEMO_SPACE } from '../common/demo-data';
import { PlanConfigService } from '../subscription/plan-config.service';

/**
 * S34: the platform fee on Apex financials is summed per revenue-share space
 * with a fixed number of queries (it used to run an event lookup + six
 * aggregates per space). Pins both the money and the query count.
 */
describe('PayoutsService.getPlatformFinancials (platform fee)', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const sum = (total: number, fee: number) => ({
    _sum: { totalAmount: d(total), processingFee: d(fee) },
  });

  const build = () => {
    const zeroAggregate = { aggregate: jest.fn().mockResolvedValue({ _sum: {} }) };
    const prisma: any = {
      eventRegistration: {
        ...zeroAggregate,
        groupBy: jest.fn().mockResolvedValue([
          { eventId: 'e1', ...sum(1100, 100) }, // net 1000
          { eventId: 'e2', ...sum(520, 20) }, // net 500
          { eventId: 'e3', ...sum(2000, 0) }, // net 2000
        ]),
      },
      stayBooking: {
        ...zeroAggregate,
        groupBy: jest.fn().mockResolvedValue([{ eventId: 'e3', ...sum(100, 0) }]),
      },
      groupSeatPurchase: { ...zeroAggregate, groupBy: jest.fn().mockResolvedValue([]) },
      payout: zeroAggregate,
      refundRequest: zeroAggregate,
      space: {
        findMany: jest.fn().mockResolvedValue([
          { id: 's1', subscription: { billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: d(10) } },
          { id: 's2', subscription: { billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: d(5) } },
          { id: 's3', subscription: { billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: d(0) } },
        ]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', spaceId: 's1' },
          { id: 'e2', spaceId: 's1' },
          { id: 'e3', spaceId: 's2' },
        ]),
      },      session: { findMany: jest.fn().mockResolvedValue([]) },
      sessionRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { svc: new PayoutsService(prisma, {} as any, {} as any, new PlanConfigService({} as any)), prisma };
  };

  it('charges each space its own percent of its held gross', async () => {
    const { svc } = build();
    const res = await svc.getPlatformFinancials();
    // s1: (1000 + 500) x 10% = 150; s2: (2000 + 100) x 5% = 105.
    expect(res.platformFee).toBe(255);
  });

  it('looks up events once and groups held money by its frozen rate (A21)', async () => {
    const { svc, prisma } = build();
    await svc.getPlatformFinancials();
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.eventRegistration.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.eventRegistration.groupBy.mock.calls[0][0].by).toEqual(['eventId', 'platformFeePercent']);
  });

  it('charges a sale the rate frozen on it, not the space rate today (A21)', async () => {
    const { svc, prisma } = build();
    // e1 was sold at 2% while s1 now charges 10%; e2 has no frozen rate (today's 10%).
    prisma.eventRegistration.groupBy.mockResolvedValue([
      { eventId: 'e1', platformFeePercent: d(2), ...sum(1100, 100) }, // 1000 x 2% = 20
      { eventId: 'e2', platformFeePercent: null, ...sum(520, 20) }, // 500 x 10% = 50
    ]);
    prisma.stayBooking.groupBy.mockResolvedValue([]);
    const res = await svc.getPlatformFinancials();
    expect(res.platformFee).toBe(70);
  });

  it('adds Huddle session money at its frozen fee (T6)', async () => {
    const { svc, prisma } = build();
    prisma.session.findMany.mockResolvedValue([{ id: 'x1', spaceId: 's1' }]);
    prisma.sessionRegistration.findMany.mockResolvedValue([
      { sessionId: 'x1', paymentStatus: 'PAID', totalAmount: d(210), processingFee: d(10), refundedAmount: d(0), platformFeePercent: null },
    ]);
    const res = await svc.getPlatformFinancials();
    // events 255 + session 200 x s1's 10% = 20
    expect(res.platformFee).toBe(275);
    expect(prisma.session.findMany.mock.calls[0][0].where).toEqual({ space: NOT_DEMO_SPACE });
  });

  it('leaves the demo space out of every aggregate (P23)', async () => {
    const { svc, prisma } = build();
    await svc.getPlatformFinancials();
    expect(prisma.space.findMany.mock.calls[0][0].where).toBe(NOT_DEMO_SPACE);
    expect(prisma.event.findMany.mock.calls[0][0].where).toBe(NOT_DEMO_EVENT);
    // Money sums are scoped to the non-demo events, never platform-wide.
    expect(prisma.eventRegistration.aggregate.mock.calls[0][0].where.eventId).toEqual({ in: ['e1', 'e2', 'e3'] });
  });
});

/** S52: automatic (sold-out) refunds have no refund request but are still money that went back. */
describe('PayoutsService refunded total', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  it('adds registration refunds that no approved request covers', async () => {
    const agg = (val: Record<string, unknown>) => jest.fn().mockResolvedValue({ _sum: val });
    const prisma: any = {
      eventRegistration: {
        aggregate: jest.fn(async (args: any) =>
          args.where.refundRequests ? { _sum: { refundedAmount: d(300) } } : { _sum: {} },
        ),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      stayBooking: { aggregate: agg({ refundedAmount: d(20) }), groupBy: jest.fn().mockResolvedValue([]) },
      groupSeatPurchase: { aggregate: agg({}), groupBy: jest.fn().mockResolvedValue([]) },
      payout: { aggregate: agg({}) },
      refundRequest: { aggregate: agg({ cashRefunded: d(50) }) },
      space: { findMany: jest.fn().mockResolvedValue([]) },
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'e1', spaceId: 's1' }]) },
      session: { findMany: jest.fn().mockResolvedValue([]) },
      sessionRegistration: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new PayoutsService(prisma, {} as any, {} as any, new PlanConfigService({} as any));
    const res = await svc.getPlatformFinancials();
    expect(res.refunded).toBe(370);
    expect(prisma.eventRegistration.aggregate).toHaveBeenCalledWith({
      where: { eventId: { in: ['e1'] }, refundedAmount: { gt: 0 }, refundRequests: { none: { status: 'APPROVED' } } },
      _sum: { refundedAmount: true },
    });
  });
});

describe('maskUpiId (P23)', () => {
  it('keeps 2 chars of the handle and the full @provider', () => {
    expect(maskUpiId('abhinav.tej@okhdfc')).toBe('ab***@okhdfc');
    expect(maskUpiId('a@ybl')).toBe('a***@ybl');
    expect(maskUpiId('nohandle')).toBe('no***');
    expect(maskUpiId(null)).toBeNull();
  });
});
