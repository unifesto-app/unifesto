import { OrgPlan, Prisma } from '@prisma/client';
import { PayoutsService, payoutSource } from './payouts.service';
import { PlanConfigService } from '../subscription/plan-config.service';

/** T6 / A17: Huddle session revenue pays out like an event's, at each sale's frozen fee. */
describe('session payouts', () => {
  const d = (n: number) => new Prisma.Decimal(n);
  const sale = (total: number, fee: number, refunded: number, pct: number | null, status = 'PAID') => ({
    totalAmount: d(total), processingFee: d(fee), refundedAmount: d(refunded), platformFeePercent: pct == null ? null : d(pct), paymentStatus: status,
  });
  const build = (sessionStatus = 'PUBLISHED') => {
    const created: any[] = [];
    const prisma: any = {
      session: {
        findUnique: jest.fn(async () => ({
          title: 'Resume clinic', createdBy: 'host', spaceId: 'sp-1', status: sessionStatus,
          space: { subscription: { plan: OrgPlan.CLUB } },
        })),
        findMany: jest.fn(async () => []),
      },
      event: { findMany: jest.fn(async () => []) },
      // A deal sale at 2.5% and an older one with no frozen rate (today's 10%).
      sessionRegistration: { findMany: jest.fn(async () => [sale(1050, 50, 0, 2.5), sale(525, 25, 0, null)]) },
      payout: {
        findMany: jest.fn(async () => []),
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => (created.push(data), data)),
      },
      payoutBankAccount: { findUnique: jest.fn(async () => ({ id: 'acct-1', userId: 'host', status: 'VERIFIED' })) },
      userRole: { findMany: jest.fn(async () => []) },
      $executeRaw: jest.fn(),
    };
    prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
    // Club's rate today is 10%.
    const planConfig = new PlanConfigService({} as any);
    jest.spyOn(planConfig, 'getLimits').mockReturnValue({ platformFeePercent: 10 } as any);
    const svc = new PayoutsService(prisma, {} as any, {} as any, planConfig);
    return { svc, prisma, created };
  };

  it('settles the session at each sale\'s own fee', async () => {
    const { svc } = build();
    const s = await svc.getPayoutSummary({ sessionId: 'ss-1' });
    // 1000 x 2.5% + 500 x 10% = 75
    expect(s).toMatchObject({ sessionId: 'ss-1', grossRevenue: 1500, estimatedPlatformFee: 75, eventNet: 1425, available: 1425 });
  });

  it('writes a payout against the session, never an event', async () => {
    const { svc, created } = build();
    await svc.createPayout({ sessionId: 'ss-1', bankAccountId: 'acct-1' }, 'admin');
    expect(created[0]).toMatchObject({ sessionId: 'ss-1', netAmount: 1425 });
    expect(created[0].eventId).toBeUndefined();
  });

  it('a cancelled session with paid sales pays nothing out', async () => {
    const { svc } = build('CANCELLED');
    await expect(svc.createPayout({ sessionId: 'ss-1', bankAccountId: 'acct-1' }, 'admin')).rejects.toThrow(/session was cancelled/);
  });

  it('a request names exactly one of event or session', () => {
    expect(() => payoutSource({})).toThrow();
    expect(() => payoutSource({ eventId: 'e', sessionId: 's' })).toThrow();
    expect(payoutSource({ sessionId: 's' })).toEqual({ sessionId: 's' });
  });
});
