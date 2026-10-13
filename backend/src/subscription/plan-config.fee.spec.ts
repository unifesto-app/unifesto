import { BillingModel, OrgPlan } from '@prisma/client';
import { PlanConfigService, platformShare } from './plan-config.service';

/** S16: one platform-fee rule for payouts, exports and plan limits. */
describe('PlanConfigService.resolvePlatformFeePercent', () => {
  const svc = new PlanConfigService({} as any);
  jest.spyOn(svc, 'getModelConfig').mockReturnValue({ defaultRevenueSharePercent: 5 } as any);

  it('a revenue-share space with no rate of its own pays the model default, not 0%', () => {
    expect(svc.resolvePlatformFeePercent({ billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: null })).toBe(5);
  });

  it('its own rate wins', () => {
    expect(svc.resolvePlatformFeePercent({ billingModel: BillingModel.REVENUE_SHARE, revenueSharePercent: 7.5 })).toBe(7.5);
  });

  it.each([BillingModel.FREE, BillingModel.SUBSCRIPTION])('%s pays none', (billingModel) => {
    expect(svc.resolvePlatformFeePercent({ billingModel, revenueSharePercent: 9 })).toBe(0);
  });

  it('plan limits report the same fee', () => {
    const limits = svc.getEffectiveLimits({
      billingModel: BillingModel.REVENUE_SHARE,
      plan: OrgPlan.STARTER,
      revenueSharePercent: null,
    });
    expect(limits.processingFeePercent).toBe(5);
  });

  it('platformShare rounds to the paise', () => {
    expect(platformShare(100.55, 5)).toBe(5.03); // 5.0275
    expect(platformShare(0, 5)).toBe(0);
  });
});
