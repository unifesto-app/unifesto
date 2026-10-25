import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { EmailService } from '../email/email.service';
import {
  BillingCycle,
  BillingModel,
  OrgPlan,
  Prisma,
} from '@prisma/client';
import { PlanConfigService, SELLABLE_PLANS, subscriptionStatus } from './plan-config.service';
import { PlanPrice, planPriceFor, TermsService } from './terms.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import {
  AdminUpdateSubscriptionDto,
  RecordOfflinePaymentDto,
  SubscriptionUsageDto,
  UpgradeSubscriptionDto,
  VerifyUpgradeDto,
} from './dto';

/** Marketing feature bullets used in activation / upgrade emails. */
const SUBSCRIPTION_PLAN_FEATURES: Record<string, string[]> = {
  GROWTH: [
    'Up to 10 events/month',
    '200 attendees per event',
    'Waitlist management',
    'Bulk export',
  ],
  PRO: [
    'Unlimited events',
    '1000 attendees per event',
    'Analytics dashboard',
    'WhatsApp blast',
    'Remove branding',
  ],
  ENTERPRISE: [
    'Unlimited everything',
    'White label',
    'Priority support',
    'Custom integrations',
  ],
};

const IST_OFFSET_MS = 330 * 60 * 1000;

/**
 * One billing cycle after `from`, on the same IST calendar day and time,
 * clamped to the month's last day (31 Jan monthly -> 28/29 Feb).
 * ponytail: no anchor day stored, so 31 Jan -> 28 Feb -> 28 Mar drifts; store
 * the anchor if renewals need to snap back to the 31st.
 */
export function addBillingCycle(from: Date, cycle: BillingCycle, n = 1): Date {
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + (cycle === BillingCycle.ANNUAL ? 12 : 1) * n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(ist.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(y, m, day, ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds(), ist.getUTCMilliseconds()) -
      IST_OFFSET_MS,
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Credit (paise) for the unused whole days of the current paid period, priced
 * at what that period cost (paidForPeriodPaise). The period is the cycle ending at
 * expiresAt, or from the last payment when that is later (bought 31 Jan, ends
 * 28 Feb: a 28-day period). Time stacked by early renewals is credited too.
 */
export function prorationCreditPaise(
  pricePaise: number,
  cycle: BillingCycle,
  expiresAt: Date,
  now: Date,
  lastPaymentAt?: Date | null,
): number {
  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return 0;
  let start = addBillingCycle(expiresAt, cycle, -1);
  if (lastPaymentAt && lastPaymentAt > start && lastPaymentAt < expiresAt) start = lastPaymentAt;
  const cycleDays = Math.max(1, Math.round((expiresAt.getTime() - start.getTime()) / DAY_MS));
  return Math.floor((pricePaise * daysLeft) / cycleDays);
}

const PLAN_RANK: Record<OrgPlan, number> = { STARTER: 0, GROWTH: 1, PRO: 2, ENTERPRISE: 3 };
const CYCLE_RANK: Record<BillingCycle, number> = { MONTHLY: 0, ANNUAL: 1 };

/** renew = same plan+cycle (extends); upgrade = starts now; downgrade = starts at period end. */
export type PlanChangeKind = 'renew' | 'upgrade' | 'downgrade';

/** Lock a subscription row for the rest of the transaction and read it fresh. */
export async function lockSubscription(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM org_subscriptions WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.orgSubscription.findUniqueOrThrow({ where: { id } });
}

/** Plans are only sold to spaces billed by subscription; FREE and REVENUE_SHARE are set by Unifesto. */
function assertSelfServeBilling(model: BillingModel) {
  if (model !== BillingModel.SUBSCRIPTION) {
    throw new BadRequestException(
      "This space's billing is arranged by Unifesto, so its plan can't be changed here. Contact support to change it.",
    );
  }
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly emailService: EmailService,
    private readonly planConfig: PlanConfigService,
    private readonly terms: TermsService,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  async getAllPlans() {
    // GROWTH is retired (D10): never listed, so no client can offer it.
    return this.planConfig.getAll().filter((p) => SELLABLE_PLANS.includes(p.plan));
  }

  /** Admin: edit a plan's definition (limits / features / pricing / fee). */
  async updatePlanConfig(
    plan: OrgPlan,
    patch: Partial<Parameters<PlanConfigService['update']>[1]>,
  ) {
    if (!Object.values(OrgPlan).includes(plan)) {
      throw new BadRequestException(`Unknown plan: ${plan}`);
    }
    return this.planConfig.update(plan, patch);
  }

  /** All billing-model definitions (Free, Revenue-share). */
  getBillingModels() {
    return this.planConfig.getAllModels();
  }

  /** Admin: edit a Free / Revenue-share definition. */
  async updateBillingModel(
    model: BillingModel,
    patch: Partial<Parameters<PlanConfigService['updateModel']>[1]>,
  ) {
    if (!PlanConfigService.CONFIGURABLE_MODELS.includes(model)) {
      throw new BadRequestException(`Model ${model} is not configurable`);
    }
    return this.planConfig.updateModel(model, patch);
  }

  // =========================================================================
  // SPACE-CENTRIC BILLING (P0.2) — the billing subject is the Space.
  // These mirror the legacy per-user methods above but key on `spaceId`, cache
  // per-space, and route billing emails to the space's accountable admin
  // (Space.createdBy). Access is gated at the controller by can(space:manage-billing).
  // =========================================================================

  /** STARTER row for a freshly created space. Called from the space-create flow. */
  async createStarterForSpace(spaceId: string) {
    return this.prisma.orgSubscription.create({
      data: {
        spaceId,
        plan: OrgPlan.STARTER,
        billingCycle: BillingCycle.MONTHLY,
        isActive: true,
        usageResetAt: this.getNextMonthStart(),
      },
    });
  }

  async getSpaceSubscription(spaceId: string) {
    const subscription = await this.prisma.orgSubscription.findUnique({
      where: { spaceId },
      include: { history: { orderBy: { changedAt: 'desc' }, take: 10 } },
    });
    if (!subscription) {
      throw new NotFoundException('This space has no subscription');
    }
    await this.cache.setSpacePlan(spaceId, subscription.plan);
    return { ...subscription, status: subscriptionStatus(subscription) };
  }

  async getSpaceUsage(spaceId: string): Promise<SubscriptionUsageDto> {
    const subscription = await this.getSpaceSubscription(spaceId);
    const limits = this.planConfig.getEffectiveLimits(subscription);
    return {
      spacesCount: 1, // per-space view: this space counts as one
      eventsThisMonth: subscription.eventsThisMonth,
      plan: subscription.plan,
      billingModel: subscription.billingModel,
      limits: {
        spaces: limits.spaces,
        eventsPerMonth: limits.eventsPerMonth,
        attendeesPerEvent: limits.attendeesPerEvent,
        ticketTypes: limits.ticketTypes,
        coCurators: limits.coCurators,
      },
      features: {
        hasWaitlist: limits.hasWaitlist,
        hasBulkExport: limits.hasBulkExport,
        hasAnalytics: limits.hasAnalytics,
        hasWhatsappBlast: limits.hasWhatsappBlast,
        hasRecurringEvents: limits.hasRecurringEvents,
        hasRemoveBranding: limits.hasRemoveBranding,
        hasPrioritySupport: limits.hasPrioritySupport,
        hasSessions: limits.hasSessions,
        hasLeaderboard: limits.hasLeaderboard,
        hasCertificates: limits.hasCertificates,
        hasSponsors: limits.hasSponsors,
      },
    };
  }

  /**
   * What buying `plan`/`cycle` does to this subscription, and the credit owed.
   * Same plan and cycle renews (extends). With paid time left, a higher plan or
   * cycle starts now with the unused days credited; a lower one is paid now and
   * starts when the current period ends. Without paid time left it starts now.
   */
  quoteChange(
    sub: {
      plan: OrgPlan;
      billingCycle: BillingCycle;
      expiresAt: Date | null;
      cancelledAt: Date | null;
      lastPaymentAt: Date | null;
    },
    plan: OrgPlan,
    cycle: BillingCycle,
    now = new Date(),
    /** What the current period cost (paise); default = its plan's list price. */
    periodPricePaise?: number | null,
  ): { kind: PlanChangeKind; creditPaise: number } {
    const diff =
      PLAN_RANK[plan] - PLAN_RANK[sub.plan] || CYCLE_RANK[cycle] - CYCLE_RANK[sub.billingCycle];
    if (diff === 0) return { kind: 'renew', creditPaise: 0 };
    const paidLeft = sub.plan !== OrgPlan.STARTER && !!sub.expiresAt && sub.expiresAt > now;
    if (!paidLeft) return { kind: 'upgrade', creditPaise: 0 };
    if (diff < 0) return { kind: 'downgrade', creditPaise: 0 };
    const price =
      periodPricePaise !== undefined
        ? periodPricePaise
        : planPriceFor(this.planConfig.getLimits(sub.plan), sub.plan, sub.billingCycle, null).pricePaise;
    return {
      kind: 'upgrade',
      creditPaise: price
        ? prorationCreditPaise(price, sub.billingCycle, sub.expiresAt!, now, sub.lastPaymentAt)
        : 0,
    };
  }

  /** The price of a plan for this space now: its space deal, else the rate card (T6). */
  async planPrice(
    spaceId: string,
    plan: OrgPlan,
    cycle: BillingCycle,
    at = new Date(),
  ): Promise<PlanPrice> {
    const deal = await this.terms.activeDeal(spaceId, null, at);
    return planPriceFor(this.planConfig.getLimits(plan), plan, cycle, deal);
  }

  /** Admin: what each paid plan and cycle costs this space now (deal or rate card). */
  async getPlanPricesForSpace(spaceId: string) {
    const deal = await this.terms.activeDeal(spaceId);
    const prices: Partial<Record<OrgPlan, Record<BillingCycle, PlanPrice>>> = {};
    for (const plan of SELLABLE_PLANS.filter((p) => p !== OrgPlan.STARTER)) {
      const limits = this.planConfig.getLimits(plan);
      prices[plan] = {
        MONTHLY: planPriceFor(limits, plan, BillingCycle.MONTHLY, deal),
        ANNUAL: planPriceFor(limits, plan, BillingCycle.ANNUAL, deal),
      };
    }
    return prices;
  }

  /**
   * What the space paid for its current period (paise), to credit unused days
   * at: the price its last payment bought, when that payment was for the plan it
   * is on. Payments before T6 (no recorded price) and plans set without a
   * payment fall back to the price in force, which is what they were credited
   * at before. ponytail: a cycle changed by an admin after the payment isn't
   * detected (history has no cycle); add one if that becomes common.
   */
  private async paidForPeriodPaise(
    spaceId: string,
    sub: { id: string; plan: OrgPlan; billingCycle: BillingCycle },
  ): Promise<number | null> {
    const last = await this.prisma.subscriptionHistory.findFirst({
      where: { subscriptionId: sub.id, amountPaise: { gt: 0 } },
      orderBy: { changedAt: 'desc' },
      select: { toPlan: true, pricePaise: true },
    });
    if (last?.pricePaise != null && last.toPlan === sub.plan) return last.pricePaise;
    return (await this.planPrice(spaceId, sub.plan, sub.billingCycle)).pricePaise;
  }

  async createUpgradeOrderForSpace(spaceId: string, dto: UpgradeSubscriptionDto) {
    if (!SELLABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('That plan is no longer available');
    }
    const subscription = await this.getSpaceSubscription(spaceId);
    // A space deal naming this plan (and cycle, if it sets one) prices it, and
    // is the only way a FREE or REVENUE_SHARE space may buy a plan (T4); paying
    // moves such a space onto SUBSCRIPTION. Without one they stay blocked.
    const { pricePaise, dealId } = await this.planPrice(spaceId, dto.plan, dto.billingCycle);
    if (!dealId) assertSelfServeBilling(subscription.billingModel);
    if (subscription.pendingPlan) {
      throw new BadRequestException(
        'A plan change is already scheduled for the end of this period. Contact support to change it.',
      );
    }

    // A comped deal (0) is applied by an admin, never paid for.
    if (pricePaise === null || pricePaise === 0) {
      throw new BadRequestException('Cannot upgrade to this plan via payment');
    }

    const { kind, creditPaise } = this.quoteChange(
      subscription,
      dto.plan,
      dto.billingCycle,
      new Date(),
      await this.paidForPeriodPaise(spaceId, subscription),
    );
    const amountPaise = pricePaise - creditPaise;
    if (amountPaise < 100) {
      throw new BadRequestException(
        'Your unused time already covers this plan. Contact support to switch.',
      );
    }

    const order = await this.razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      // Razorpay caps receipts at 40 chars; a UUID alone is 36.
      receipt: `sub_${Date.now()}_${spaceId.slice(0, 8)}`,
      notes: {
        spaceId,
        plan: dto.plan,
        billingCycle: dto.billingCycle,
        kind,
        creditPaise: String(creditPaise),
        // The plan price bought (before credit) and its deal, recorded on payment.
        listPaise: String(pricePaise),
        ...(dealId ? { dealId } : {}),
      },
    });

    this.logger.log(`Created Razorpay order ${order.id} (${kind}) for space ${spaceId}`);

    return {
      orderId: order.id,
      amount: amountPaise / 100,
      currency: 'INR',
      plan: dto.plan,
      billingCycle: dto.billingCycle,
      kind,
      credit: creditPaise / 100,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
    };
  }

  async verifyAndActivateForSpace(spaceId: string, dto: VerifyUpgradeDto) {
    const expected = Buffer.from(
      crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${dto.orderId}|${dto.paymentId}`)
        .digest('hex'),
    );
    const given = Buffer.from(String(dto.signature ?? ''));
    if (
      expected.length !== given.length ||
      !crypto.timingSafeEqual(expected, given)
    ) {
      throw new BadRequestException('Invalid payment signature');
    }

    // The signature proves a genuine payment, not that it paid for THIS space's
    // upgrade: the order must be this space's and actually paid.
    const order = await this.razorpay.orders.fetch(dto.orderId);
    if (order.notes?.spaceId !== spaceId) {
      throw new BadRequestException('That payment is for a different space.');
    }
    if (order.status !== 'paid') {
      throw new BadRequestException('That order has not been paid.');
    }

    const { subscription, applied } = await this.applyPaidOrder(spaceId, order, dto.paymentId);
    if (!applied) {
      // The webhook (or an earlier verify) already applied this payment: fine
      // when it was for this subscription, a replay otherwise.
      const prior = await this.prisma.subscriptionHistory.findFirst({
        where: { OR: [{ paymentId: dto.paymentId }, { orderId: dto.orderId }] },
        select: { subscriptionId: true },
      });
      if (prior?.subscriptionId !== subscription.id) {
        throw new BadRequestException('This payment has already been used.');
      }
    }
    return subscription;
  }

  /**
   * Razorpay webhook (`order.paid`, or a `payment.captured` no other product
   * claimed): activate a plan order the browser never verified. Returns false
   * when the order isn't a plan order. Idempotent with verify (S28 + claim).
   */
  async completeFromWebhook(
    orderId: string,
    paymentId: string,
    order?: { id: string; status?: string; amount: number | string; notes?: any },
  ): Promise<boolean> {
    const o = order ?? (await this.razorpay.orders.fetch(orderId).catch(() => null));
    const n = o?.notes;
    if (!o || !n?.spaceId || !n.plan || !n.billingCycle) return false;
    if (o.status && o.status !== 'paid') {
      this.logger.warn(`Plan order ${orderId} is ${o.status}, not paid; not activating`);
      return true;
    }
    await this.applyPaidOrder(String(n.spaceId), { ...o, id: orderId }, paymentId);
    return true;
  }

  /**
   * Apply a paid plan order once. The payment and order ids are claimed on a
   * history row (both unique) under a row lock, so verify, the webhook and the
   * expiry cron serialise: whoever claims first applies it, the rest no-op.
   */
  private async applyPaidOrder(
    spaceId: string,
    order: { id: string; amount: number | string; notes?: any },
    paymentId: string,
  ) {
    const n = order.notes ?? {};
    const plan = n.plan as OrgPlan;
    const billingCycle = n.billingCycle as BillingCycle;
    // Orders made before T8 carry no kind: they extended, like a renewal.
    let kind = (n.kind as PlanChangeKind) ?? 'renew';
    const amountPaise = Math.round(Number(order.amount));
    // A deal-priced order (T4) records the deal's price and moves the space
    // onto SUBSCRIPTION billing, so a FREE / REVENUE_SHARE space gets its plan.
    const dealId = typeof n.dealId === 'string' ? n.dealId : null;
    // The plan price the order bought, before credit. Orders made before T6
    // without one were rate-card priced.
    const pricePaise =
      n.listPaise != null
        ? Number(n.listPaise)
        : planPriceFor(this.planConfig.getLimits(plan), plan, billingCycle, null).pricePaise;

    const row = await this.prisma.orgSubscription.findUnique({
      where: { spaceId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('This space has no subscription');

    const now = new Date();
    let fromPlan: OrgPlan = OrgPlan.STARTER;
    let expiresAt: Date | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const sub = await lockSubscription(tx, row.id);
      fromPlan = sub.plan;
      const hasTimeLeft = !!sub.expiresAt && sub.expiresAt > now;
      // A downgrade whose current period already ran out just starts now.
      if (kind === 'downgrade' && !hasTimeLeft) kind = 'upgrade';

      const start = kind === 'upgrade' || !hasTimeLeft ? now : sub.expiresAt!;
      expiresAt = addBillingCycle(start, billingCycle);

      const claimed = await tx.subscriptionHistory.createMany({
        data: [
          {
            subscriptionId: sub.id,
            fromPlan: sub.plan,
            toPlan: plan,
            reason:
              kind === 'renew'
                ? 'Paid renewal'
                : kind === 'downgrade'
                  ? `Paid downgrade (starts ${this.formatDate(sub.expiresAt!)})`
                  : 'Paid upgrade',
            paymentId,
            orderId: order.id,
            amountPaise,
            pricePaise,
            dealId,
          },
        ],
        skipDuplicates: true,
      });
      if (claimed.count === 0) return { subscription: sub, applied: false };

      const paid = {
        cancelledAt: null,
        isActive: true,
        lastPaymentAt: now,
        nextPaymentAt: expiresAt,
        ...(dealId ? { billingModel: BillingModel.SUBSCRIPTION } : {}),
      };
      const subscription = await tx.orgSubscription.update({
        where: { id: sub.id },
        data:
          kind === 'downgrade'
            ? { ...paid, pendingPlan: plan, pendingBillingCycle: billingCycle }
            : {
                ...paid,
                plan,
                billingCycle,
                amount: new Prisma.Decimal((pricePaise ?? amountPaise) / 100),
                expiresAt,
                pendingPlan: null,
                pendingBillingCycle: null,
              },
      });
      return { subscription, applied: true };
    });

    if (!result.applied) return result;

    await this.cache.invalidateSpacePlanCache(spaceId);
    this.logger.log(`Applied ${kind} to ${plan} for space ${spaceId} (payment ${paymentId})`);

    const recipient = await this.resolveSpaceBillingRecipient(spaceId);
    if (recipient.email && kind !== 'downgrade') {
      if (fromPlan === OrgPlan.STARTER) {
        this.emailService
          .sendSubscriptionActivated({
            email: recipient.email,
            userName: recipient.name,
            plan,
            billingCycle,
            amount: amountPaise / 100,
            expiresAt: this.formatDate(expiresAt!),
            features: SUBSCRIPTION_PLAN_FEATURES[plan] || [],
          })
          .catch((err) =>
            this.logger.error('Failed to send subscription activated email', err),
          );
      } else if (fromPlan !== plan) {
        this.emailService
          .sendSubscriptionUpgraded({
            email: recipient.email,
            userName: recipient.name,
            fromPlan,
            toPlan: plan,
            newFeatures: SUBSCRIPTION_PLAN_FEATURES[plan] || [],
          })
          .catch((err) =>
            this.logger.error('Failed to send subscription upgraded email', err),
          );
      }
    }

    return result;
  }

  /**
   * Cancel at period end: the plan and expiresAt stay, cancelledAt marks it, and
   * the expiry cron moves the space to Starter once expiresAt passes. A paid plan
   * with no end date (or one already past) has no period left, so it ends now.
   */
  async cancelSubscriptionForSpace(spaceId: string) {
    const subscription = await this.getSpaceSubscription(spaceId);

    if (subscription.plan === OrgPlan.STARTER) {
      throw new BadRequestException('Cannot cancel free plan');
    }
    assertSelfServeBilling(subscription.billingModel);
    if (subscription.cancelledAt) {
      throw new BadRequestException('This plan is already cancelled');
    }

    const now = new Date();
    const endsAt =
      subscription.expiresAt && subscription.expiresAt > now ? subscription.expiresAt : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromPlan: subscription.plan,
          toPlan: endsAt ? subscription.plan : OrgPlan.STARTER,
          reason: endsAt ? 'User cancelled (ends at period end)' : 'User cancelled',
        },
      });

      return tx.orgSubscription.update({
        where: { id: subscription.id },
        data: endsAt
          ? { cancelledAt: now, nextPaymentAt: null }
          : {
              plan: OrgPlan.STARTER,
              isActive: true,
              cancelledAt: now,
              expiresAt: null,
              nextPaymentAt: null,
            },
      });
    });

    await this.cache.invalidateSpacePlanCache(spaceId);
    this.logger.log(`Cancelled subscription for space ${spaceId}`);

    const recipient = await this.resolveSpaceBillingRecipient(spaceId);
    if (recipient.email) {
      this.emailService
        .sendSubscriptionCancelled({
          email: recipient.email,
          userName: recipient.name,
          plan: subscription.plan,
          expiresAt: endsAt ? this.formatDate(endsAt) : this.formatDate(now),
        })
        .catch((err) =>
          this.logger.error('Failed to send subscription cancelled email', err),
        );
    }

    return updated;
  }

  /**
   * The subscription that governs a space: its own space-keyed row. (The legacy
   * per-user fallback was removed with the P2.2 contract migration once every
   * space owned a row.)
   */
  async getEffectiveSubscriptionForSpace(spaceId: string) {
    return this.prisma.orgSubscription.findUnique({ where: { spaceId } });
  }

  /** Bump a space's monthly event usage (events belong to spaces). */
  async incrementEventUsageForSpace(spaceId: string) {
    const subscription = await this.getEffectiveSubscriptionForSpace(spaceId);
    if (!subscription) return; // nothing to meter (rare edge during transition)

    if (subscription.usageResetAt < new Date()) {
      await this.prisma.orgSubscription.update({
        where: { id: subscription.id },
        data: { eventsThisMonth: 1, usageResetAt: this.getNextMonthStart() },
      });
    } else {
      await this.prisma.orgSubscription.update({
        where: { id: subscription.id },
        data: { eventsThisMonth: { increment: 1 } },
      });
    }
  }

  /** Platform admin: manually edit a space's billing arrangement. */
  async adminUpdateSubscriptionForSpace(
    spaceId: string,
    dto: AdminUpdateSubscriptionDto,
  ) {
    let subscription = await this.prisma.orgSubscription.findUnique({
      where: { spaceId },
    });
    if (!subscription) {
      subscription = await this.createStarterForSpace(spaceId);
    }

    if (dto.plan !== undefined && dto.plan !== subscription.plan && !SELLABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('That plan is retired; pick Starter, Pro or Enterprise');
    }

    const data: Prisma.OrgSubscriptionUpdateInput = {};
    if (dto.billingModel !== undefined) data.billingModel = dto.billingModel;
    if (dto.billingCycle !== undefined) data.billingCycle = dto.billingCycle;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.revenueSharePercent !== undefined) {
      data.revenueSharePercent = dto.revenueSharePercent;
    }
    if (dto.plan !== undefined) data.plan = dto.plan;
    // A plan or cycle change with no amount takes the space deal's price (T6).
    // Without a deal the amount is left as it was.
    if (dto.amount === undefined && (dto.plan !== undefined || dto.billingCycle !== undefined)) {
      const price = await this.planPrice(
        spaceId,
        dto.plan ?? subscription.plan,
        dto.billingCycle ?? subscription.billingCycle,
      );
      if (price.dealId && price.pricePaise !== null) data.amount = price.pricePaise / 100;
    }

    // Every admin change is logged with it, in one transaction (from = to plan
    // when only the arrangement changed).
    const sub = subscription;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionHistory.create({
        data: {
          subscriptionId: sub.id,
          fromPlan: sub.plan,
          toPlan: dto.plan ?? sub.plan,
          reason: dto.reason?.trim() || 'Admin updated',
        },
      });
      return tx.orgSubscription.update({
        where: { id: sub.id },
        data,
        include: { space: { select: { id: true, name: true, slug: true } } },
      });
    });

    await this.cache.invalidateSpacePlanCache(spaceId);
    return updated;
  }

  /**
   * Platform admin: record a payment made outside Razorpay (bank transfer,
   * cheque). Same plan extends from the current end; another plan starts now.
   * A reference is recorded once (as `offline:<ref>` on the history row).
   */
  async recordOfflinePaymentForSpace(spaceId: string, dto: RecordOfflinePaymentDto) {
    if (dto.plan === OrgPlan.STARTER || !SELLABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('Pick a paid plan (Pro or Enterprise)');
    }
    const row =
      (await this.prisma.orgSubscription.findUnique({ where: { spaceId }, select: { id: true } })) ??
      (await this.createStarterForSpace(spaceId));
    const ref = dto.reference?.trim();
    const now = new Date();
    // No amount given: the price in force (deal or rate card, T6).
    const price = await this.planPrice(spaceId, dto.plan, dto.billingCycle, now);
    const amountPaise = dto.amount != null ? Math.round(dto.amount * 100) : price.pricePaise;
    if (!amountPaise) {
      throw new BadRequestException('Enter the amount received; this plan has no set price.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await lockSubscription(tx, row.id);
      const start =
        sub.plan === dto.plan && sub.expiresAt && sub.expiresAt > now ? sub.expiresAt : now;
      const expiresAt = addBillingCycle(start, dto.billingCycle);
      await tx.subscriptionHistory
        .create({
          data: {
            subscriptionId: sub.id,
            fromPlan: sub.plan,
            toPlan: dto.plan,
            reason: ['Offline payment', ref, dto.note?.trim()].filter(Boolean).join(' · ').slice(0, 500),
            paymentId: ref ? `offline:${ref}` : null,
            amountPaise,
            pricePaise: amountPaise,
            dealId: price.dealId,
          },
        })
        .catch((e) => {
          if (e?.code === 'P2002') {
            throw new BadRequestException('A payment with this reference is already recorded.');
          }
          throw e;
        });
      return tx.orgSubscription.update({
        where: { id: sub.id },
        data: {
          billingModel: BillingModel.SUBSCRIPTION,
          plan: dto.plan,
          billingCycle: dto.billingCycle,
          amount: new Prisma.Decimal(dto.amount ?? amountPaise / 100),
          isActive: true,
          expiresAt,
          cancelledAt: null,
          pendingPlan: null,
          pendingBillingCycle: null,
          lastPaymentAt: now,
          nextPaymentAt: expiresAt,
        },
        include: { space: { select: { id: true, name: true, slug: true } } },
      });
    });

    await this.cache.invalidateSpacePlanCache(spaceId);
    return updated;
  }

  /**
   * Platform admin: every Space with its billing arrangement (P2.1 re-center).
   * Replaces the organiser-keyed `getAllSubscriptions` — the Space is the billing
   * subject now. Filters constrain the space's OWN space-keyed row; spaces that
   * have not been backfilled yet (P2.2) still *display* their creator's legacy
   * arrangement (marked `inherited`), resolved via one batched lookup per page.
   */
  async getAllSpaceSubscriptions(
    page = 1,
    limit = 20,
    filters: {
      billingModel?: BillingModel;
      plan?: OrgPlan;
      isActive?: boolean;
      search?: string;
    } = {},
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.SpaceWhereInput = {};
    const subFilter: Prisma.OrgSubscriptionWhereInput = {};
    if (filters.billingModel) subFilter.billingModel = filters.billingModel;
    if (filters.plan) subFilter.plan = filters.plan;
    if (filters.isActive !== undefined) subFilter.isActive = filters.isActive;
    if (Object.keys(subFilter).length > 0) {
      where.subscription = { is: subFilter };
    }

    if (filters.search) {
      const search = filters.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [spaces, total] = await Promise.all([
      this.prisma.space.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          status: true,
          createdBy: true,
          creator: {
            select: {
              id: true,
              fullName: true,
              username: true,
              mobileNumber: true,
              identities: { select: { email: true }, take: 1 },
            },
          },
          subscription: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.space.count({ where }),
    ]);

    const deals = await this.terms.activeSpaceDeals(spaces.map((sp) => sp.id));
    const data = spaces.map((sp) => {
      const own = sp.subscription;
      const eff = own;
      const admin = sp.creator
        ? {
            id: sp.creator.id,
            fullName: sp.creator.fullName,
            username: sp.creator.username,
            mobileNumber: sp.creator.mobileNumber,
            identities: sp.creator.identities,
          }
        : null;
      return {
        id: own?.id ?? null,
        spaceId: sp.id,
        /** True when the space has its OWN space-keyed subscription row. */
        configured: !!own,
        /** Legacy field kept for payload shape; always false post-contract. */
        inherited: false,
        billingModel: eff?.billingModel ?? null,
        revenueSharePercent: eff?.revenueSharePercent ?? null,
        plan: eff?.plan ?? null,
        billingCycle: eff?.billingCycle ?? BillingCycle.MONTHLY,
        amount: eff?.amount ?? 0,
        /** The current plan's price now (T6): the space deal's, else the rate card's. */
        priceInForce: eff
          ? planPriceFor(this.planConfig.getLimits(eff.plan), eff.plan, eff.billingCycle, deals.get(sp.id) ?? null)
          : null,
        currency: eff?.currency ?? 'INR',
        isActive: eff?.isActive ?? false,
        status: eff ? subscriptionStatus(eff) : null,
        pendingPlan: eff?.pendingPlan ?? null,
        lastPaymentAt: eff?.lastPaymentAt ?? null,
        cancelledAt: eff?.cancelledAt ?? null,
        startedAt: eff?.startedAt ?? null,
        expiresAt: eff?.expiresAt ?? null,
        nextPaymentAt: eff?.nextPaymentAt ?? null,
        eventsThisMonth: eff?.eventsThisMonth ?? 0,
        usageResetAt: eff?.usageResetAt ?? null,
        createdAt: eff?.createdAt ?? null,
        updatedAt: eff?.updatedAt ?? null,
        space: {
          id: sp.id,
          name: sp.name,
          slug: sp.slug,
          logoUrl: sp.logoUrl,
          status: sp.status,
        },
        admin,
      };
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Space-driven summary counts for the admin billing overview (P2.1). */
  async getSpaceBillingStats() {
    const spaces = await this.prisma.space.findMany({
      select: {
        createdBy: true,
        subscription: {
          select: {
            billingModel: true,
            isActive: true,
          },
        },
      },
    });

    let free = 0;
    let revenueShare = 0;
    let subscription = 0;
    let notConfigured = 0;
    let active = 0;
    for (const sp of spaces) {
      const s = sp.subscription;
      if (!s) {
        notConfigured += 1;
        continue;
      }
      if (s.isActive) active += 1;
      if (s.billingModel === BillingModel.FREE) free += 1;
      else if (s.billingModel === BillingModel.REVENUE_SHARE) revenueShare += 1;
      else if (s.billingModel === BillingModel.SUBSCRIPTION) subscription += 1;
    }

    // MRR from what was actually paid: each live, uncancelled subscription's
    // latest payment spread over its cycle, at the plan price it bought (deal or
    // rate card, before proration credit; T6). Comp plans (never paid) add
    // nothing. ponytail: payments before T6 have no price, so an upgrade paid
    // then still counts net of its credit until it renews.
    const payments = await this.prisma.subscriptionHistory.findMany({
      where: {
        amountPaise: { gt: 0 },
        subscription: { billingModel: BillingModel.SUBSCRIPTION, cancelledAt: null },
      },
      orderBy: { changedAt: 'desc' },
      distinct: ['subscriptionId'],
      select: {
        amountPaise: true,
        pricePaise: true,
        subscription: {
          select: {
            plan: true,
            billingCycle: true,
            expiresAt: true,
            cancelledAt: true,
            pendingPlan: true,
            pendingBillingCycle: true,
          },
        },
      },
    });
    let mrrPaise = 0;
    for (const p of payments) {
      const s = p.subscription;
      if (s.plan === OrgPlan.STARTER || subscriptionStatus(s) === 'EXPIRED') continue;
      const cycle = s.pendingBillingCycle ?? s.billingCycle;
      mrrPaise += (p.pricePaise ?? p.amountPaise ?? 0) / (cycle === BillingCycle.ANNUAL ? 12 : 1);
    }
    const mrr = mrrPaise / 100;

    return {
      total: spaces.length,
      free,
      revenueShare,
      subscription,
      notConfigured,
      active,
      mrr: Math.round(mrr),
    };
  }

  /** The person billing emails for a space go to: its accountable admin. */
  private async resolveSpaceBillingRecipient(
    spaceId: string,
  ): Promise<{ email: string | null; name: string; spaceName: string }> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: {
        name: true,
        creator: {
          select: {
            fullName: true,
            username: true,
            identities: {
              where: { email: { not: null } },
              select: { email: true },
              take: 1,
            },
          },
        },
      },
    });
    return {
      email: space?.creator?.identities[0]?.email ?? null,
      name: space?.creator?.fullName || space?.creator?.username || 'there',
      spaceName: space?.name ?? '',
    };
  }

  private getNextMonthStart(): Date {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
