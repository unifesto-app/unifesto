import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingCycle, Deal, OrgPlan, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FeeTerms, rateCardFees } from '../payments/quote';
import { PlanConfigService, SELLABLE_PLANS } from './plan-config.service';
import { GATEWAY_FEE_PERCENT } from './plan-limits.config';
import { PlatformConfigService } from './platform-config.service';

/** The terms a sale or a plan is priced under (T4). */
export interface Terms extends FeeTerms {
  /** The deal these came from; null = the rate card. */
  dealId: string | null;
  plan: OrgPlan;
  billingCycle: BillingCycle | null;
  /** Deal plan price in paise: null = rate card, 0 = comp. */
  planPricePaise: number | null;
  organiserFeeBps: number;
  /**
   * The organiser fee is fixed by these terms (a deal's own, or 0 on a
   * one-fee plan) and written onto the sale, not left to the trigger.
   */
  organiserFeeFromDeal: boolean;
}

/**
 * Columns a paid row stores for its terms (T5): the deal, and the deal's
 * organiser fee frozen into the A21 column. Without a deal's own fee the
 * column is left to the stamp_platform_fee trigger, exactly as before.
 * `reset` (updates of an existing unpaid row): clear a fee an earlier deal set.
 */
export function dealColumns(t: Terms, reset = false) {
  return {
    dealId: t.dealId,
    ...(t.organiserFeeFromDeal
      ? { platformFeePercent: new Prisma.Decimal(t.organiserFeeBps).div(100) }
      : reset
        ? { platformFeePercent: null }
        : {}),
  };
}

/** A plan price and the deal it comes from (null = rate card). */
export interface PlanPrice {
  /** Paise; null = not sold at a set price (custom / contact sales), 0 = comp. */
  pricePaise: number | null;
  dealId: string | null;
}

/**
 * The price of `plan` on `cycle` (T6): a space deal naming the plan (and the
 * cycle, if it sets one) prices it, and a sale under it records its id; a deal
 * whose planPricePaise is null keeps the rate card's price. Anything else is
 * the rate card (rupees in plan_configs, so x100).
 */
export function planPriceFor(
  rateCard: { monthlyPrice: number | null; annualPrice: number | null },
  plan: OrgPlan,
  cycle: BillingCycle,
  deal: Pick<Deal, 'id' | 'plan' | 'billingCycle' | 'planPricePaise'> | null,
): PlanPrice {
  const list = cycle === BillingCycle.MONTHLY ? rateCard.monthlyPrice : rateCard.annualPrice;
  const listPaise = list === null ? null : list * 100;
  if (!deal || deal.plan !== plan || (deal.billingCycle && deal.billingCycle !== cycle)) {
    return { pricePaise: listPaise, dealId: null };
  }
  return { pricePaise: deal.planPricePaise ?? listPaise, dealId: deal.id };
}

export interface CreateDealInput {
  eventId?: string | null;
  plan?: OrgPlan | null;
  planPricePaise?: number | null;
  billingCycle?: BillingCycle | null;
  buyerFeeBps?: number | null;
  organiserFeeBps?: number | null;
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
  note?: string | null;
}

/**
 * Resolves what a space (or one of its events) is charged (T4): the active
 * event deal, else the active space deal, else the rate card of the space's
 * plan. Any field a deal leaves null falls back to the rate card. The rate
 * card's organiser fee is resolvePlatformFeePercent (the plan's rate in
 * plan_configs), so it never drifts from D10; the buyer fee is PlatformConfig's 4% / ₹99 (D11).
 */
@Injectable()
export class TermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly platformConfig: PlatformConfigService,
  ) {}

  /** The deal in force for a space (and event) at `at`, if any. */
  async activeDeal(
    spaceId: string,
    eventId?: string | null,
    at = new Date(),
  ): Promise<Deal | null> {
    const deals = await this.prisma.deal.findMany({
      where: {
        spaceId,
        validFrom: { lte: at },
        AND: [
          { OR: [{ validUntil: null }, { validUntil: { gt: at } }] },
          { OR: [{ eventId: null }, ...(eventId ? [{ eventId }] : [])] },
        ],
      },
      orderBy: { validFrom: 'desc' },
    });
    return deals.find((d) => d.eventId) ?? deals[0] ?? null;
  }

  /** The space deal (no event) in force for each space at `at`, newest first wins. */
  async activeSpaceDeals(spaceIds: string[], at = new Date()): Promise<Map<string, Deal>> {
    const deals = spaceIds.length
      ? await this.prisma.deal.findMany({
          where: {
            spaceId: { in: spaceIds },
            eventId: null,
            validFrom: { lte: at },
            OR: [{ validUntil: null }, { validUntil: { gt: at } }],
          },
          orderBy: { validFrom: 'desc' },
        })
      : [];
    const bySpace = new Map<string, Deal>();
    for (const d of deals) if (!bySpace.has(d.spaceId)) bySpace.set(d.spaceId, d);
    return bySpace;
  }

  async resolve(
    spaceId: string,
    eventId?: string | null,
    at = new Date(),
  ): Promise<Terms> {
    const [deal, sub] = await Promise.all([
      this.activeDeal(spaceId, eventId, at),
      this.prisma.orgSubscription.findUnique({
        where: { spaceId },
        select: { plan: true, billingCycle: true },
      }),
    ]);
    const plan = deal?.plan ?? sub?.plan ?? OrgPlan.STARTER;
    const base = {
      dealId: deal?.id ?? null,
      plan,
      billingCycle: deal?.billingCycle ?? sub?.billingCycle ?? null,
      planPricePaise: deal?.planPricePaise ?? null,
    };
    // One processing fee (12 Nov 2026): the deal's rate or the plan's, no cap,
    // and an organiser fee of 0 frozen onto the sale so nothing takes it twice.
    const oneFee = this.planConfig.getLimits(plan).processingFeePercent;
    if (oneFee != null) {
      return {
        ...base,
        buyerFeeBps: deal?.buyerFeeBps ?? Math.round(oneFee * 100),
        buyerFeeCapPaise: null,
        organiserFeeBps: 0,
        organiserFeeFromDeal: true,
      };
    }
    const rate = rateCardFees(this.platformConfig);
    return {
      ...base,
      buyerFeeBps: deal?.buyerFeeBps ?? rate.buyerFeeBps,
      buyerFeeCapPaise: rate.buyerFeeCapPaise,
      organiserFeeBps:
        deal?.organiserFeeBps ??
        Math.round(this.planConfig.resolvePlatformFeePercent(sub) * 100),
      organiserFeeFromDeal: deal?.organiserFeeBps != null,
    };
  }

  async forEvent(eventId: string, at = new Date()): Promise<Terms> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return this.resolve(event.spaceId, eventId, at);
  }

  // ---- Apex admin ----

  listDeals(spaceId: string) {
    return this.prisma.deal.findMany({
      where: { spaceId },
      orderBy: { validFrom: 'desc' },
      include: { event: { select: { id: true, title: true } } },
    });
  }

  async createDeal(spaceId: string, input: CreateDealInput, createdBy: string) {
    if (input.plan && !SELLABLE_PLANS.includes(input.plan)) {
      throw new BadRequestException(
        'That plan is not available',
      );
    }
    if (input.eventId) {
      const event = await this.prisma.event.findFirst({
        where: { id: input.eventId, spaceId },
        select: { id: true },
      });
      if (!event)
        throw new BadRequestException('That event is not in this space');
    }
    await this.assertDealFee(spaceId, input);
    const validFrom = input.validFrom ? new Date(input.validFrom) : new Date();
    const validUntil = input.validUntil ? new Date(input.validUntil) : null;
    if (validUntil && validUntil <= validFrom) {
      throw new BadRequestException('A deal must end after it starts');
    }
    return this.prisma.deal.create({
      data: {
        spaceId,
        eventId: input.eventId || null,
        plan: input.plan ?? null,
        planPricePaise: input.planPricePaise ?? null,
        billingCycle: input.billingCycle ?? null,
        buyerFeeBps: input.buyerFeeBps ?? null,
        organiserFeeBps: input.organiserFeeBps ?? null,
        validFrom,
        validUntil,
        note: input.note?.trim() || null,
        createdBy,
      },
    });
  }

  /**
   * On a one-fee plan a deal sets just the processing fee, between the payment
   * gateway's cost and the plan's own rate, so the "up to" on /pricing stays
   * true; an organiser fee there would be charged on top of it.
   */
  private async assertDealFee(spaceId: string, input: CreateDealInput) {
    const sub = input.plan
      ? null
      : await this.prisma.orgSubscription.findUnique({ where: { spaceId }, select: { plan: true } });
    const oneFee = this.planConfig.getLimits(input.plan ?? sub?.plan ?? OrgPlan.STARTER).processingFeePercent;
    if (oneFee == null) return;
    if (input.organiserFeeBps) {
      throw new BadRequestException('This plan has one processing fee: leave the organiser fee empty');
    }
    const bps = input.buyerFeeBps;
    if (bps != null && (bps < GATEWAY_FEE_PERCENT * 100 || bps > Math.round(oneFee * 100))) {
      throw new BadRequestException(`The processing fee must be between ${GATEWAY_FEE_PERCENT}% and the plan's ${oneFee}%`);
    }
  }

  /** End a deal now. Deals are never deleted: sales that cite one keep it. */
  async endDeal(dealId: string) {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) throw new NotFoundException('Deal not found');
    const now = new Date();
    if (deal.validUntil && deal.validUntil <= now) return deal;
    return this.prisma.deal.update({
      where: { id: dealId },
      // A deal that hasn't started yet ends before it begins.
      data: { validUntil: deal.validFrom > now ? deal.validFrom : now },
    });
  }
}
