import { OrgPlan } from '@prisma/client';
import { SubscriptionService } from './subscription.service';
import { PlanConfigService } from './plan-config.service';
import { PublicConfigController } from '../config/public-config.controller';
import { rateCardTerms } from './terms.testing';
import { PLAN_CATALOG, PLAN_FEATURE_FLAGS } from './plan-limits.config';

const LINEUP = [OrgPlan.STARTER, OrgPlan.CLUB, OrgPlan.GROWTH, OrgPlan.PRO, OrgPlan.ENTERPRISE];

/** The five plans: General (STARTER), Club, Growth, Pro, Enterprise, in ladder order. */
describe('plan lineup', () => {
  const planConfig = new PlanConfigService({} as any);
  const svc = new SubscriptionService({} as any, {} as any, {} as any, planConfig, rateCardTerms());

  it('lists every plan in ladder order', async () => {
    expect((await svc.getAllPlans()).map((p) => p.plan)).toEqual(LINEUP);
  });

  it('the public rate card shows every plan with its platform fee and the buyer fee', () => {
    const ctrl = new PublicConfigController({ getProcessingFeePercent: () => 5, getProcessingFeeCapPerTicket: () => 99 } as any, planConfig);
    const card = ctrl.getPlanFees();
    expect(card.buyerProcessingFeePercent).toBe(5);
    expect(card.buyerProcessingFeeCapPerTicket).toBe(99);
    expect(card.plans.map((p) => p.plan)).toEqual(LINEUP);
    expect(card.plans.every((p) => p.platformFeePercent === 0)).toBe(true); // ships at 0
  });
});

describe('PLAN_CATALOG', () => {
  const rows = PLAN_CATALOG.flatMap((g) => g.rows);

  it('lists every feature switch and every limit, so no plan page misses one', () => {
    const flags = new Set(rows.map((r) => ('flag' in r ? r.flag : null)));
    expect(PLAN_FEATURE_FLAGS.filter((f) => !flags.has(f))).toEqual([]);
    const limits = new Set(rows.flatMap((r) => ('limit' in r ? [r.limit] : [])));
    expect([...limits].sort()).toEqual(['attendeesPerEvent', 'coCurators', 'eventsPerMonth', 'spaces', 'ticketTypes']);
  });
});
