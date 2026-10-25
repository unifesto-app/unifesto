// Test-only: a TermsService that always answers with the rate card (no deal),
// so specs of the money paths keep pricing at 5% capped ₹99 like before T5.
import { OrgPlan } from '@prisma/client';
import type { Terms, TermsService } from './terms.service';

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
