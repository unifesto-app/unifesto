import { OrgPlan } from '@prisma/client';
import { PlanConfigService, platformShare } from './plan-config.service';

/** S16 + A9: one platform-fee rule for payouts, exports and plan limits. */
describe('PlanConfigService.resolvePlatformFeePercent', () => {
  const rates: Record<string, number> = { STARTER: 2.5, CLUB: 2, GROWTH: 1.5, PRO: 1.25, ENTERPRISE: 1 };
  const svc = new PlanConfigService({} as any);
  jest.spyOn(svc, 'getLimits').mockImplementation((plan: OrgPlan) => ({ platformFeePercent: rates[plan] }) as any);

  it.each(Object.entries(rates))('%s pays its own rate (%s%%)', (plan, pct) =>
    expect(svc.resolvePlatformFeePercent({ plan: plan as OrgPlan })).toBe(pct),
  );
  it('no plan on the row falls back to General (Starter)', () =>
    expect(svc.resolvePlatformFeePercent({ plan: null })).toBe(2.5));
  it('no subscription pays none', () => expect(svc.resolvePlatformFeePercent(null)).toBe(0));

  it('ships at 0: the compiled default for every plan is 0', () => {
    const fresh = new PlanConfigService({} as any);
    for (const plan of Object.values(OrgPlan)) expect(fresh.getLimits(plan).platformFeePercent).toBe(0);
  });

  it('plan limits report the same fee', () => {
    expect(svc.getEffectiveLimits({ plan: OrgPlan.CLUB }).platformFeePercent).toBe(2);
  });

  it('platformShare rounds to the paise', () => {
    expect(platformShare(100.55, 5)).toBe(5.03); // 5.0275
    expect(platformShare(0, 5)).toBe(0);
  });
});
