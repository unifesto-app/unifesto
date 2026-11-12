import { OrgPlan } from '@prisma/client';
import { quote } from '../payments/quote';
import { PlanConfigService, assertOneFee } from './plan-config.service';
import { TermsService, dealColumns } from './terms.service';

/**
 * One processing fee (12 Nov 2026): a plan with processingFeePercent charges
 * that rate (gateway included), uncapped, and no organiser fee. Plans without
 * it keep the old rate card, so nothing moves until an admin sets a rate.
 */
describe('one processing fee', () => {
  const planConfig = new PlanConfigService({} as any);
  jest.spyOn(planConfig, 'getLimits').mockImplementation(
    (plan) =>
      ({
        // General is on the one fee at 7%; Pro is still on the old rate card.
        platformFeePercent: plan === OrgPlan.PRO ? 4.5 : 0,
        processingFeePercent: plan === OrgPlan.PRO ? null : 7,
      }) as any,
  );
  const platformConfig = { getProcessingFeePercent: () => 4, getProcessingFeeCapPerTicket: () => 99 };
  const build = (deals: any[], plan: OrgPlan) => {
    const prisma = {
      deal: { findMany: jest.fn(async () => deals), create: jest.fn(async ({ data }) => data) },
      orgSubscription: { findUnique: jest.fn(async () => ({ plan, billingCycle: null })) },
      event: { findFirst: jest.fn(async () => ({ id: 'e' })) },
    };
    return new TermsService(prisma as any, planConfig, platformConfig as any);
  };
  const deal = (over: any) => ({
    id: 'd', eventId: null, plan: null, planPricePaise: null, billingCycle: null,
    buyerFeeBps: null, organiserFeeBps: null, ...over,
  });

  it('charges the plan rate with no cap and freezes an organiser fee of 0', async () => {
    const t = await build([], OrgPlan.STARTER).resolve('s', 'e');
    expect(t).toMatchObject({ buyerFeeBps: 700, buyerFeeCapPaise: null, organiserFeeBps: 0, organiserFeeFromDeal: true });
    // The sale row gets 0 written, so the stamp trigger never adds a plan fee.
    expect(Number((dealColumns(t) as { platformFeePercent?: unknown }).platformFeePercent)).toBe(0);
    // ₹10,000 ticket: 7% = ₹700, no ₹99 cap.
    expect(quote(1_000_000, t)).toMatchObject({ buyerFeePaise: 70_000, totalPaise: 1_070_000, organiserFeePaise: 0 });
    // The organiser includes it: carved out of the listed price, still uncapped.
    expect(quote(1_000_000, t, { absorb: true })).toMatchObject({ buyerFeePaise: 65_421, totalPaise: 1_000_000 });
  });

  it('a deal sets a lower rate; an old deal organiser fee is ignored', async () => {
    const t = await build([deal({ buyerFeeBps: 500, organiserFeeBps: 300 })], OrgPlan.STARTER).resolve('s');
    expect(t).toMatchObject({ dealId: 'd', buyerFeeBps: 500, buyerFeeCapPaise: null, organiserFeeBps: 0 });
  });

  it('a deal made before the switch is held between the gateway and the plan rate', async () => {
    expect((await build([deal({ buyerFeeBps: 800 })], OrgPlan.STARTER).resolve('s')).buyerFeeBps).toBe(700);
    expect((await build([deal({ buyerFeeBps: 0, organiserFeeBps: 600 })], OrgPlan.STARTER).resolve('s')).buyerFeeBps).toBe(250);
  });

  it("the subscription's plan picks the fees, not a deal's plan (as the stamp trigger does)", async () => {
    // Space on General (one fee) with an old Pro deal: still the one fee.
    expect(await build([deal({ plan: OrgPlan.PRO })], OrgPlan.STARTER).resolve('s')).toMatchObject({
      plan: OrgPlan.PRO, buyerFeeBps: 700, buyerFeeCapPaise: null, organiserFeeBps: 0,
    });
    // Space on Pro (old fees) with a General deal: still the old fees.
    expect(await build([deal({ plan: OrgPlan.STARTER })], OrgPlan.PRO).resolve('s')).toMatchObject({
      buyerFeeBps: 400, buyerFeeCapPaise: 9_900, organiserFeeBps: 450,
    });
  });

  it('plans without a rate keep the old rate card', async () => {
    const t = await build([], OrgPlan.PRO).resolve('s');
    expect(t).toMatchObject({ buyerFeeBps: 400, buyerFeeCapPaise: 9_900, organiserFeeBps: 450, organiserFeeFromDeal: false });
  });

  it('deals on a one-fee plan stay between the gateway and the plan rate', async () => {
    const svc = build([], OrgPlan.STARTER);
    await expect(svc.createDeal('s', { buyerFeeBps: 800 }, 'u')).rejects.toThrow('between 2.5%');
    await expect(svc.createDeal('s', { buyerFeeBps: 200 }, 'u')).rejects.toThrow('between 2.5%');
    await expect(svc.createDeal('s', { organiserFeeBps: 100 }, 'u')).rejects.toThrow('organiser fee');
    await expect(svc.createDeal('s', { buyerFeeBps: 550 }, 'u')).resolves.toMatchObject({ buyerFeeBps: 550 });
    // Old-rate-card plans keep today's free-form deals.
    await expect(build([], OrgPlan.PRO).createDeal('s', { buyerFeeBps: 800, organiserFeeBps: 100 }, 'u')).resolves.toBeTruthy();
  });

  it('a partial plan edit cannot slip an organiser fee past the guard', async () => {
    const prisma = { planConfig: { upsert: jest.fn(async () => ({})) } };
    const svc = new PlanConfigService(prisma as any);
    await svc.update(OrgPlan.CLUB, { platformFeePercent: 0, processingFeePercent: 7 });
    // An old Apex tab sends only the organiser fee; the DTO carries the rest as undefined.
    await expect(svc.update(OrgPlan.CLUB, { platformFeePercent: 3, processingFeePercent: undefined })).rejects.toThrow('organiser fee to 0');
    expect(svc.getLimits(OrgPlan.CLUB)).toMatchObject({ platformFeePercent: 0, processingFeePercent: 7 });
  });

  it('a plan cannot charge the organiser fee next to the one fee, or go under the gateway', () => {
    expect(() => assertOneFee({ platformFeePercent: 3, processingFeePercent: 7 })).toThrow('organiser fee to 0');
    expect(() => assertOneFee({ platformFeePercent: 0, processingFeePercent: 2 })).toThrow('payment gateway');
    expect(() => assertOneFee({ platformFeePercent: 3, processingFeePercent: null })).not.toThrow();
    expect(() => assertOneFee({ platformFeePercent: 0, processingFeePercent: 7 })).not.toThrow();
  });
});
