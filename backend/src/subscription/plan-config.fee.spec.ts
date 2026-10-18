import { BillingModel, OrgPlan } from '@prisma/client';
import { PlanConfigService, platformShare } from './plan-config.service';

/** S16 + A9: one platform-fee rule for payouts, exports and plan limits. */
describe('PlanConfigService.resolvePlatformFeePercent', () => {
  const svc = new PlanConfigService({} as any);
  jest.spyOn(svc, 'getModelConfig').mockReturnValue({ defaultRevenueSharePercent: 5 } as any);

  it('a revenue-share space with no rate of its own pays the model default, not 0%', () => {
    expect(svc.resolvePlatformFeePercent({ billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: null })).toBe(5);
  });

  it('its own rate wins', () => {
    expect(svc.resolvePlatformFeePercent({ billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: 7.5 })).toBe(7.5);
  });

  it('FREE (comped) pays none', () => {
    expect(svc.resolvePlatformFeePercent({ billingModel: BillingModel.FREE, revenueSharePercent: 9 })).toBe(0);
  });

  describe('SUBSCRIPTION pays its plan rate (A9)', () => {
    const rates: Record<string, number> = { STARTER: 2.5, GROWTH: 9, PRO: 1.5, ENTERPRISE: 1 };
    const priced = new PlanConfigService({} as any);
    jest.spyOn(priced, 'getLimits').mockImplementation((plan: OrgPlan) => ({ platformFeePercent: rates[plan] }) as any);
    const fee = (plan: OrgPlan | null) =>
      priced.resolvePlatformFeePercent({ billingModel: BillingModel.SUBSCRIPTION, plan, revenueSharePercent: 7 });

    it.each([
      [OrgPlan.STARTER, 2.5],
      [OrgPlan.PRO, 1.5],
      [OrgPlan.ENTERPRISE, 1],
    ])('%s pays %s%%', (plan, pct) => expect(fee(plan)).toBe(pct));

    it('retired GROWTH pays Starter\'s rate, never its own row', () => expect(fee(OrgPlan.GROWTH)).toBe(2.5));
    it('no plan on the row falls back to Starter', () => expect(fee(null)).toBe(2.5));
    it('ships at 0: the compiled default for every plan is 0', () => {
      const fresh = new PlanConfigService({} as any);
      for (const plan of Object.values(OrgPlan)) expect(fresh.getLimits(plan).platformFeePercent).toBe(0);
    });
  });

  it('plan limits report the same fee', () => {
    const limits = svc.getEffectiveLimits({
      billingModel: BillingModel.REVENUE_SHARE,
      plan: OrgPlan.STARTER,
      revenueSharePercent: null,
    });
    expect(limits.platformFeePercent).toBe(5);
  });

  it('platformShare rounds to the paise', () => {
    expect(platformShare(100.55, 5)).toBe(5.03); // 5.0275
    expect(platformShare(0, 5)).toBe(0);
  });
});
