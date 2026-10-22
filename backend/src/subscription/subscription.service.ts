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
import { PlanConfigService, SELLABLE_PLANS } from './plan-config.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import {
  AdminUpdateSubscriptionDto,
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
export function addBillingCycle(from: Date, cycle: BillingCycle): Date {
  const ist = new Date(from.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth() + (cycle === BillingCycle.ANNUAL ? 12 : 1);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(ist.getUTCDate(), lastDay);
  return new Date(
    Date.UTC(y, m, day, ist.getUTCHours(), ist.getUTCMinutes(), ist.getUTCSeconds(), ist.getUTCMilliseconds()) -
      IST_OFFSET_MS,
  );
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
    return subscription;
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

  async createUpgradeOrderForSpace(spaceId: string, dto: UpgradeSubscriptionDto) {
    if (!SELLABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('That plan is no longer available');
    }
    const subscription = await this.getSpaceSubscription(spaceId);
    assertSelfServeBilling(subscription.billingModel);

    if (
      subscription.plan === dto.plan &&
      subscription.billingCycle === dto.billingCycle
    ) {
      throw new BadRequestException('Already on this plan');
    }

    const planLimits = this.planConfig.getLimits(dto.plan);
    const amount =
      dto.billingCycle === BillingCycle.MONTHLY
        ? planLimits.monthlyPrice
        : planLimits.annualPrice;

    if (amount === null || amount === 0) {
      throw new BadRequestException('Cannot upgrade to this plan via payment');
    }

    const order = await this.razorpay.orders.create({
      amount: amount * 100,
      currency: 'INR',
      receipt: `sub_${spaceId}_${Date.now()}`,
      notes: { spaceId, plan: dto.plan, billingCycle: dto.billingCycle },
    });

    this.logger.log(`Created Razorpay order ${order.id} for space ${spaceId}`);

    return {
      orderId: order.id,
      amount,
      currency: 'INR',
      plan: dto.plan,
      billingCycle: dto.billingCycle,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID!,
    };
  }

  async verifyAndActivateForSpace(spaceId: string, dto: VerifyUpgradeDto) {
    const subscription = await this.getSpaceSubscription(spaceId);

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
    // upgrade: the order must be this space's and actually paid. The payment id
    // is recorded once (unique on subscription_history), so a receipt can't be
    // replayed onto another space or re-used next month.
    const order = await this.razorpay.orders.fetch(dto.orderId);
    if (order.notes?.spaceId !== spaceId) {
      throw new BadRequestException('That payment is for a different space.');
    }
    if (order.status !== 'paid') {
      throw new BadRequestException('That order has not been paid.');
    }
    const plan = order.notes?.plan as OrgPlan;
    const billingCycle = order.notes?.billingCycle as BillingCycle;

    // Time left on the current period carries over; a lapsed one starts now.
    const now = new Date();
    const periodStart =
      subscription.expiresAt && subscription.expiresAt > now ? subscription.expiresAt : now;
    const expiresAt = addBillingCycle(periodStart, billingCycle);

    const oldPlan = subscription.plan;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Claim the payment first: a replayed id hits the unique index and the
      // whole upgrade rolls back.
      await tx.subscriptionHistory
        .create({
          data: {
            subscriptionId: subscription.id,
            fromPlan: subscription.plan,
            toPlan: plan,
            reason: 'Paid upgrade',
            paymentId: dto.paymentId,
          },
        })
        .catch((e) => {
          if (e?.code === 'P2002') {
            throw new BadRequestException('This payment has already been used.');
          }
          throw e;
        });

      return tx.orgSubscription.update({
        where: { id: subscription.id },
        data: {
          plan,
          billingCycle,
          amount: new Prisma.Decimal(Number(order.amount) / 100),
          isActive: true,
          expiresAt,
          cancelledAt: null,
          lastPaymentAt: now,
          nextPaymentAt: expiresAt,
        },
      });
    });

    await this.cache.invalidateSpacePlanCache(spaceId);
    this.logger.log(`Activated ${plan} plan for space ${spaceId}`);

    const recipient = await this.resolveSpaceBillingRecipient(spaceId);
    if (recipient.email) {
      if (oldPlan === OrgPlan.STARTER) {
        this.emailService
          .sendSubscriptionActivated({
            email: recipient.email,
            userName: recipient.name,
            plan,
            billingCycle,
            amount: Number(updated.amount),
            expiresAt: this.formatDate(expiresAt),
            features: SUBSCRIPTION_PLAN_FEATURES[plan] || [],
          })
          .catch((err) =>
            this.logger.error('Failed to send subscription activated email', err),
          );
      } else {
        this.emailService
          .sendSubscriptionUpgraded({
            email: recipient.email,
            userName: recipient.name,
            fromPlan: oldPlan,
            toPlan: plan,
            newFeatures: SUBSCRIPTION_PLAN_FEATURES[plan] || [],
          })
          .catch((err) =>
            this.logger.error('Failed to send subscription upgraded email', err),
          );
      }
    }

    return updated;
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

    // A plan change is always logged; any other change is logged when the admin
    // left a note, so the note isn't dropped (from = to plan for those).
    const planChanged = !!dto.plan && dto.plan !== subscription.plan;
    const note = dto.reason?.trim();
    if (planChanged || note) {
      await this.prisma.subscriptionHistory.create({
        data: {
          subscriptionId: subscription.id,
          fromPlan: subscription.plan,
          toPlan: dto.plan ?? subscription.plan,
          reason: note || 'Admin updated',
        },
      });
    }

    const updated = await this.prisma.orgSubscription.update({
      where: { id: subscription.id },
      data,
      include: { space: { select: { id: true, name: true, slug: true } } },
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
        currency: eff?.currency ?? 'INR',
        isActive: eff?.isActive ?? false,
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
            amount: true,
            billingCycle: true,
          },
        },
      },
    });

    let free = 0;
    let revenueShare = 0;
    let subscription = 0;
    let notConfigured = 0;
    let active = 0;
    let mrr = 0;

    for (const sp of spaces) {
      const s = sp.subscription;
      if (!s) {
        notConfigured += 1;
        continue;
      }
      if (s.isActive) active += 1;
      if (s.billingModel === BillingModel.FREE) free += 1;
      else if (s.billingModel === BillingModel.REVENUE_SHARE) revenueShare += 1;
      else if (s.billingModel === BillingModel.SUBSCRIPTION) {
        subscription += 1;
        if (s.isActive) {
          const amt = Number(s.amount) || 0;
          mrr += s.billingCycle === BillingCycle.ANNUAL ? amt / 12 : amt;
        }
      }
    }

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
