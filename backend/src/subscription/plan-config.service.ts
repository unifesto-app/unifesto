import { Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { OrgPlan, PlanConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, PlanLimits } from './plan-limits.config';

/**
 * Plans a space can buy or be put on, in ladder order: General (STARTER),
 * Club, Growth, Pro, Enterprise.
 */
export const SELLABLE_PLANS: OrgPlan[] = [
  OrgPlan.STARTER,
  OrgPlan.CLUB,
  OrgPlan.GROWTH,
  OrgPlan.PRO,
  OrgPlan.ENTERPRISE,
];

export type SubscriptionStatus = 'ACTIVE' | 'GRACE' | 'EXPIRED';
export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A plan's standing from its dates (T8): ACTIVE until expiresAt, then GRACE
 * for 7 days (an unpaid renewal keeps its limits), then EXPIRED (Starter
 * limits, data kept). A cancelled plan ends at expiresAt with no grace; a paid
 * downgrade waiting to start counts as ACTIVE. Starter and undated plans never
 * expire.
 */
export function subscriptionStatus(
  sub: {
    plan: OrgPlan;
    expiresAt?: Date | null;
    cancelledAt?: Date | null;
    pendingPlan?: OrgPlan | null;
  },
  now = new Date(),
): SubscriptionStatus {
  if (sub.plan === OrgPlan.STARTER || !sub.expiresAt || sub.pendingPlan) return 'ACTIVE';
  const end = sub.expiresAt.getTime();
  if (now.getTime() < end) return 'ACTIVE';
  if (!sub.cancelledAt && now.getTime() < end + GRACE_DAYS * DAY_MS) return 'GRACE';
  return 'EXPIRED';
}

/**
 * Source of truth for what each subscription plan includes. Rows live in the
 * `plan_configs` table (admin-editable); this service loads them into memory at
 * boot so enforcement code (events / registrations / subscription limits) can
 * read limits *synchronously* — exactly like the old hardcoded config, but now
 * editable. Falls back to the compiled defaults if a row is missing.
 *
 * Note: the in-memory cache is per-process. The replica that takes an edit
 * updates at once; the others reload within ~2s via RedisService.syncCache.
 */
@Injectable()
export class PlanConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlanConfigService.name);
  private cache = new Map<OrgPlan, PlanLimits>();

  /** Tells the other replicas to reload after an edit here. */
  private bumpReplicas: () => Promise<void> = async () => {};

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    if (this.redis) this.bumpReplicas = this.redis.syncCache('plans', () => this.reload());
  }

  private rowToLimits(row: PlanConfig): PlanLimits {
    return {
      spaces: row.spaces,
      eventsPerMonth: row.eventsPerMonth,
      attendeesPerEvent: row.attendeesPerEvent,
      ticketTypes: row.ticketTypes,
      coCurators: row.coCurators,
      hasWaitlist: row.hasWaitlist,
      hasBulkExport: row.hasBulkExport,
      hasAnalytics: row.hasAnalytics,
      hasWhatsappBlast: row.hasWhatsappBlast,
      hasRecurringEvents: row.hasRecurringEvents,
      hasRemoveBranding: row.hasRemoveBranding,
      hasPrioritySupport: row.hasPrioritySupport,
      hasSessions: row.hasSessions,
      hasLeaderboard: row.hasLeaderboard,
      hasCertificates: row.hasCertificates,
      hasSponsors: row.hasSponsors,
      platformFeePercent: Number(row.platformFeePercent),
      monthlyPrice: row.monthlyPrice,
      annualPrice: row.annualPrice,
    };
  }

  async reload(): Promise<void> {
    try {
      const planRows = await this.prisma.planConfig.findMany();
      const plans = new Map<OrgPlan, PlanLimits>();
      for (const row of planRows) plans.set(row.plan, this.rowToLimits(row));
      this.cache = plans;
      this.logger.log(`Loaded ${planRows.length} plan configs`);
    } catch (error) {
      this.logger.error('Failed to load configs; using defaults', error);
    }
  }

  /** Sync accessor for enforcement code. Falls back to compiled defaults. */
  getLimits(plan: OrgPlan): PlanLimits {
    return this.cache.get(plan) ?? PLAN_LIMITS[plan];
  }

  /** The limits that apply to a space's subscription: a lapsed plan keeps its data but gets Starter's limits (T8). */
  getEffectiveLimits(sub: {
    plan: OrgPlan;
    expiresAt?: Date | null;
    cancelledAt?: Date | null;
    pendingPlan?: OrgPlan | null;
  }): PlanLimits {
    return this.getLimits(subscriptionStatus(sub) === 'EXPIRED' ? OrgPlan.STARTER : sub.plan);
  }

  /**
   * Platform fee % an organiser pays out of ticket sales — the single source
   * for payouts, exports and plan limits (A9, D10): the space's plan's
   * `platformFeePercent`, or 0 with no subscription.
   *
   * MIRRORED in SQL by `platform_fee_percent_for_space` (migration
   * 20261117100000_plan_lineup; `platform_fee_percent_for_event` calls it),
   * which freezes this rate on each sale when it's paid (A21, T6). Change
   * both together: ship a migration that does CREATE OR REPLACE FUNCTION with
   * the new rule.
   */
  resolvePlatformFeePercent(sub?: { plan?: OrgPlan | null } | null): number {
    return sub ? this.getLimits(sub.plan ?? OrgPlan.STARTER).platformFeePercent : 0;
  }

  /** All plans with their current limits, in plan order. */
  getAll(): (PlanLimits & { plan: OrgPlan })[] {
    return (Object.keys(PLAN_LIMITS) as OrgPlan[]).map((plan) => ({
      plan,
      ...this.getLimits(plan),
    }));
  }

  /** Admin edit: persist a partial change and refresh the in-memory cache. */
  async update(
    plan: OrgPlan,
    patch: Partial<PlanLimits>,
  ): Promise<PlanLimits & { plan: OrgPlan }> {
    const merged: PlanLimits = { ...this.getLimits(plan), ...patch };
    const data = {
      spaces: merged.spaces,
      eventsPerMonth: merged.eventsPerMonth,
      attendeesPerEvent: merged.attendeesPerEvent,
      ticketTypes: merged.ticketTypes,
      coCurators: merged.coCurators,
      hasWaitlist: merged.hasWaitlist,
      hasBulkExport: merged.hasBulkExport,
      hasAnalytics: merged.hasAnalytics,
      hasWhatsappBlast: merged.hasWhatsappBlast,
      hasRecurringEvents: merged.hasRecurringEvents,
      hasRemoveBranding: merged.hasRemoveBranding,
      hasPrioritySupport: merged.hasPrioritySupport,
      hasSessions: merged.hasSessions,
      hasLeaderboard: merged.hasLeaderboard,
      hasCertificates: merged.hasCertificates,
      hasSponsors: merged.hasSponsors,
      platformFeePercent: merged.platformFeePercent,
      monthlyPrice: merged.monthlyPrice,
      annualPrice: merged.annualPrice,
    };
    await this.prisma.planConfig.upsert({
      where: { plan },
      create: { plan, ...data },
      update: data,
    });
    this.cache.set(plan, merged);
    await this.bumpReplicas();
    return { plan, ...merged };
  }
}

/** The platform's cut of `gross` at `percent`, rounded to the paise. */
export function platformShare(gross: number, percent: number): number {
  return Math.round(gross * percent + 1e-9) / 100;
}
