// Test-only: a TermsService that always answers with the rate card (no deal),
// so specs of the money paths keep pricing at 5% capped ₹99 like before T5.
import { OrgPlan } from '@prisma/client';
import type { Terms, TermsService } from './terms.service';
import { PlanConfigService } from './plan-config.service';
import { PLAN_LIMITS } from './plan-limits.config';

/** Monthly / annual rupees the paid plans sold at before Z2 set them to 0. */
const CHECKOUT_PRICES: Partial<Record<OrgPlan, [number, number]>> = {
  CLUB: [499, 4990],
  GROWTH: [1999, 19990],
  PRO: [2999, 29990],
};

/**
 * A PlanConfigService with the old monthly prices, for specs of plan checkout.
 * Z2 priced plans by fee and set every price to 0 (checkout refuses a ₹0
 * plan), but the checkout code stays for an admin who sets a price again.
 */
export function pricedPlanConfig(prisma: any = {}) {
  const svc = new PlanConfigService(prisma);
  jest.spyOn(svc, 'getLimits').mockImplementation((plan) => {
    const price = CHECKOUT_PRICES[plan];
    return price ? { ...PLAN_LIMITS[plan], monthlyPrice: price[0], annualPrice: price[1] } : PLAN_LIMITS[plan];
  });
  return svc;
}

export const RATE_CARD_TERMS: Terms = {
  dealId: null,
  plan: OrgPlan.STARTER,
  billingCycle: null,
  planPricePaise: null,
  buyerFeeBps: 500,
  buyerFeeCapPaise: 9_900,
  organiserFeeBps: 0,
  organiserFeeFromDeal: false,
};

export const rateCardTerms = (terms: Partial<Terms> = {}) =>
  ({
    resolve: async () => ({ ...RATE_CARD_TERMS, ...terms }),
    forEvent: async () => ({ ...RATE_CARD_TERMS, ...terms }),
    activeDeal: async () => null,
    activeSpaceDeals: async () => new Map(),
  }) as unknown as TermsService;
