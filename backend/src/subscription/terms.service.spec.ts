import { OrgPlan } from '@prisma/client';
import { PlanConfigService } from './plan-config.service';
import { TermsService, dealColumns } from './terms.service';

/** T4: event deal, else space deal, else the rate card; null deal fields fall back. */
describe('TermsService.resolve', () => {
  const planConfig = new PlanConfigService({} as any);
  // D10 rates as an admin sets them in Apex Plans.
  jest
    .spyOn(planConfig, 'getLimits')
    .mockImplementation(
      (plan) =>
        ({
          platformFeePercent: {
            STARTER: 2.5,
            CLUB: 2,
            GROWTH: 1.5,
            PRO: 1.25,
            ENTERPRISE: 1,
          }[plan],
        }) as any,
    );
  const platformConfig = {
    getProcessingFeePercent: () => 5,
    getProcessingFeeCapPerTicket: () => 99,
  };

  const build = (deals: any[], sub: any) => {
    const prisma = {
      deal: { findMany: jest.fn(async () => deals) },
      orgSubscription: { findUnique: jest.fn(async () => sub) },
    };
    return {
      svc: new TermsService(prisma as any, planConfig, platformConfig as any),
      prisma,
    };
  };
  const pro = {
    plan: OrgPlan.PRO,
    billingCycle: 'MONTHLY',
  };
  const deal = (over: any) => ({
    id: 'd',
    eventId: null,
    plan: null,
    planPricePaise: null,
    billingCycle: null,
    buyerFeeBps: null,
    organiserFeeBps: null,
    ...over,
  });

  it('no deal: the rate card of the space plan, organiser fee from plan_configs', async () => {
    const { svc } = build([], pro);
    expect(await svc.resolve('s', 'e')).toEqual({
      dealId: null,
      plan: OrgPlan.PRO,
      billingCycle: 'MONTHLY',
      planPricePaise: null,
      buyerFeeBps: 500,
      buyerFeeCapPaise: 9_900,
      organiserFeeBps: 125,
      organiserFeeFromDeal: false,
    });
  });

  it('each plan pays its own rate; no subscription pays 0', async () => {
    const fee = async (plan: OrgPlan) => (await build([], { plan }).svc.resolve('s')).organiserFeeBps;
    expect(await fee(OrgPlan.CLUB)).toBe(200);
    expect(await fee(OrgPlan.GROWTH)).toBe(150);
    expect((await build([], null).svc.resolve('s')).organiserFeeBps).toBe(0);
  });

  it('a space deal overrides only the fields it sets', async () => {
    const { svc } = build([deal({ id: 'space', buyerFeeBps: 300 })], pro);
    const t = await svc.resolve('s', 'e');
    expect(t).toMatchObject({
      dealId: 'space',
      buyerFeeBps: 300,
      organiserFeeBps: 125,
      organiserFeeFromDeal: false,
    });
  });

  it('an event deal beats a newer space deal', async () => {
    const { svc } = build(
      [
        deal({ id: 'space', organiserFeeBps: 50 }),
        deal({ id: 'event', eventId: 'e', organiserFeeBps: 0 }),
      ],
      pro,
    );
    expect(await svc.resolve('s', 'e')).toMatchObject({
      dealId: 'event',
      organiserFeeBps: 0,
      organiserFeeFromDeal: true,
    });
  });

  it('asks only for deals in force for this space and event', async () => {
    const { svc, prisma } = build([], pro);
    const at = new Date('2026-11-02T00:00:00Z');
    await svc.resolve('s', 'e', at);
    expect(prisma.deal.findMany.mock.calls[0]).toEqual([
      expect.objectContaining({
        where: {
          spaceId: 's',
          validFrom: { lte: at },
          AND: [
            { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
            { OR: [{ eventId: null }, { eventId: 'e' }] },
          ],
        },
      }),
    ]);
  });

  it('dealColumns: nothing new on a rate-card sale, the deal fee frozen on a deal sale', () => {
    const rate = {
      dealId: null,
      organiserFeeFromDeal: false,
      organiserFeeBps: 150,
    } as any;
    expect(dealColumns(rate)).toEqual({ dealId: null });
    expect(dealColumns(rate, true)).toEqual({
      dealId: null,
      platformFeePercent: null,
    });
    const withFee: any = dealColumns({
      dealId: 'd',
      organiserFeeFromDeal: true,
      organiserFeeBps: 125,
    } as any);
    expect(withFee.dealId).toBe('d');
    expect(Number(withFee.platformFeePercent)).toBe(1.25);
    expect(
      dealColumns({
        dealId: 'd',
        organiserFeeFromDeal: false,
        organiserFeeBps: 150,
      } as any),
    ).toEqual({ dealId: 'd' });
  });
});
