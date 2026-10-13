import { BillingModel, Prisma } from '@prisma/client';
import { PayoutsService } from './payouts.service';

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
      },
    };
    return { svc: new PayoutsService(prisma, {} as any, {} as any), prisma };
  };

  it('charges each space its own percent of its held gross', async () => {
    const { svc } = build();
    const res = await svc.getPlatformFinancials();
    // s1: (1000 + 500) x 10% = 150; s2: (2000 + 100) x 5% = 105.
    expect(res.platformFee).toBe(255);
  });

  it('looks up events once for all spaces and skips 0% spaces', async () => {
    const { svc, prisma } = build();
    await svc.getPlatformFinancials();
    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({
      spaceId: { in: ['s1', 's2'] },
    });
    expect(prisma.eventRegistration.groupBy).toHaveBeenCalledTimes(1);
  });
});
