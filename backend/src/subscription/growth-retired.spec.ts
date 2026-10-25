import { BadRequestException } from '@nestjs/common';
import { BillingCycle, OrgPlan } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { PlanConfigService } from './plan-config.service';
import { PublicConfigController } from '../config/public-config.controller';
import { rateCardTerms } from './terms.testing';

/** A9 / D10: GROWTH is retired; the public rate card lists only sellable plans. */
describe('GROWTH retired (A9)', () => {
  const planConfig = new PlanConfigService({} as any);
  const prisma: any = {
    orgSubscription: {
      findUnique: jest.fn(async () => ({ id: 'sub-1', spaceId: 'sp-1', plan: OrgPlan.STARTER })),
      update: jest.fn(async () => ({})),
    },
  };
  const svc = new SubscriptionService(prisma, {} as any, {} as any, planConfig, rateCardTerms());

  it('is never listed as a plan', async () => {
    const plans = await svc.getAllPlans();
    expect(plans.map((p) => p.plan)).toEqual([OrgPlan.STARTER, OrgPlan.PRO, OrgPlan.ENTERPRISE]);
  });

  it('cannot be bought', async () => {
    await expect(
      svc.createUpgradeOrderForSpace('sp-1', { plan: OrgPlan.GROWTH, billingCycle: BillingCycle.MONTHLY }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cannot be assigned by an admin', async () => {
    await expect(svc.adminUpdateSubscriptionForSpace('sp-1', { plan: OrgPlan.GROWTH } as any)).rejects.toThrow(/retired/);
    expect(prisma.orgSubscription.update).not.toHaveBeenCalled();
  });

  it('the public rate card shows sellable plans with their platform fee and the buyer fee', () => {
    const ctrl = new PublicConfigController({ getProcessingFeePercent: () => 5, getProcessingFeeCapPerTicket: () => 99 } as any, planConfig);
    const card = ctrl.getPlanFees();
    expect(card.buyerProcessingFeePercent).toBe(5);
    expect(card.buyerProcessingFeeCapPerTicket).toBe(99);
    expect(card.plans.map((p) => p.plan)).toEqual([OrgPlan.STARTER, OrgPlan.PRO, OrgPlan.ENTERPRISE]);
    expect(card.plans.every((p) => p.platformFeePercent === 0)).toBe(true); // ships at 0
  });
});
