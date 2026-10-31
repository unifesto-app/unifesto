import { ForbiddenException, Injectable, OnModuleInit, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { OrgPlan, PlanConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FEATURE_LABELS,
  PLAN_LIMITS,
  PLAN_NAMES,
  PlanFeatureFlag,
  PlanLimitKey,
  PlanLimits,
} from './plan-limits.config';

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
      hasRemoveBranding: row.hasRemoveBranding,
      hasPrioritySupport: row.hasPrioritySupport,
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
   * The plan a space is on now and its limits (T9): a lapsed plan reads as
   * General (STARTER), and so does a space with no subscription row, so no
   * gate fails open.
   */
  async spaceLimits(spaceId: string): Promise<PlanLimits & { plan: OrgPlan }> {
    const sub = await this.prisma.orgSubscription.findUnique({
      where: { spaceId },
      select: { plan: true, expiresAt: true, cancelledAt: true, pendingPlan: true },
    });
    const plan = !sub || subscriptionStatus(sub) === 'EXPIRED' ? OrgPlan.STARTER : sub.plan;
    return { plan, ...this.getLimits(plan) };
  }

  /** The cheapest plan that passes `test`, for the "comes with X and up" hint. */
  private cheapestPlan(test: (l: PlanLimits) => boolean): OrgPlan | undefined {
    return SELLABLE_PLANS.find((p) => test(this.getLimits(p)));
  }

  /** 403 unless the space's plan includes `flag` (T9). */
  async assertFeature(spaceId: string, flag: PlanFeatureFlag): Promise<void> {
    const limits = await this.spaceLimits(spaceId);
    if (limits[flag]) return;
    const up = this.cheapestPlan((l) => l[flag]);
    throw new ForbiddenException(
      `Not on the ${PLAN_NAMES[limits.plan]} plan: ${FEATURE_LABELS[flag]}.` +
        (up ? ` It comes with ${PLAN_NAMES[up]} and up.` : ''),
    );
  }

  /**
   * 403 when `current + adding` would pass the space plan's `limit` (null =
   * unlimited). `what` names the counted thing, singular and plural:
   * ['co-curator per event', 'co-curators per event'].
   */
  async assertLimit(
    spaceId: string,
    limit: PlanLimitKey,
    current: number,
    what: [string, string],
    adding = 1,
  ): Promise<void> {
    const limits = await this.spaceLimits(spaceId);
    const max = limits[limit];
    if (max === null || current + adding <= max) return;
    const up = this.cheapestPlan((l) => l[limit] === null || l[limit]! >= current + adding);
    throw new ForbiddenException(
      `The ${PLAN_NAMES[limits.plan]} plan allows ${max} ${max === 1 ? what[0] : what[1]}.` +
        (up ? ` ${PLAN_NAMES[up]} allows more.` : ''),
    );
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
      hasRemoveBranding: merged.hasRemoveBranding,
      hasPrioritySupport: merged.hasPrioritySupport,
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
