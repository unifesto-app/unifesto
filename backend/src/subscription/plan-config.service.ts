import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  BillingModel,
  BillingModelConfig,
  OrgPlan,
  PlanConfig,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PLAN_LIMITS, PlanLimits } from './plan-limits.config';

/** Public shape of a billing-model config (Free / Revenue-share). */
export interface ModelConfig extends Omit<
  PlanLimits,
  'processingFeePercent' | 'monthlyPrice' | 'annualPrice'
> {
  billingModel: BillingModel;
  defaultRevenueSharePercent: number | null;
}

/**
 * Source of truth for what each subscription plan includes. Rows live in the
 * `plan_configs` table (admin-editable); this service loads them into memory at
 * boot so enforcement code (events / registrations / subscription limits) can
 * read limits *synchronously* — exactly like the old hardcoded config, but now
 * editable. Falls back to the compiled defaults if a row is missing.
 *
 * Note: the in-memory cache is per-process. On a single backend container an
 * admin edit takes effect immediately. If scaled to multiple instances, other
 * instances pick up changes on their next `reload()` / restart.
 */
@Injectable()
export class PlanConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlanConfigService.name);
  private cache = new Map<OrgPlan, PlanLimits>();
  private modelCache = new Map<BillingModel, ModelConfig>();

  /** Billing models that carry their own editable limits/features. */
  static readonly CONFIGURABLE_MODELS: BillingModel[] = [
    BillingModel.FREE,
    BillingModel.REVENUE_SHARE,
  ];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
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
      processingFeePercent: Number(row.processingFeePercent),
      monthlyPrice: row.monthlyPrice,
      annualPrice: row.annualPrice,
    };
  }

  private rowToModelConfig(row: BillingModelConfig): ModelConfig {
    return {
      billingModel: row.billingModel,
      defaultRevenueSharePercent:
        row.defaultRevenueSharePercent === null
          ? null
          : Number(row.defaultRevenueSharePercent),
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
    };
  }

  private defaultModelConfig(model: BillingModel): ModelConfig {
    // Fallback if a row is missing: base off STARTER limits.
    const base = PLAN_LIMITS[OrgPlan.STARTER];
    return {
      billingModel: model,
      defaultRevenueSharePercent:
        model === BillingModel.REVENUE_SHARE ? 8 : null,
      spaces: base.spaces,
      eventsPerMonth: base.eventsPerMonth,
      attendeesPerEvent: base.attendeesPerEvent,
      ticketTypes: base.ticketTypes,
      coCurators: base.coCurators,
      hasWaitlist: base.hasWaitlist,
      hasBulkExport: base.hasBulkExport,
      hasAnalytics: base.hasAnalytics,
      hasWhatsappBlast: base.hasWhatsappBlast,
      hasRecurringEvents: base.hasRecurringEvents,
      hasRemoveBranding: base.hasRemoveBranding,
      hasPrioritySupport: base.hasPrioritySupport,
      hasSessions: base.hasSessions,
      hasLeaderboard: base.hasLeaderboard,
      hasCertificates: base.hasCertificates,
      hasSponsors: base.hasSponsors,
    };
  }

  async reload(): Promise<void> {
    try {
      const [planRows, modelRows] = await Promise.all([
        this.prisma.planConfig.findMany(),
        this.prisma.billingModelConfig.findMany(),
      ]);
      const plans = new Map<OrgPlan, PlanLimits>();
      for (const row of planRows) plans.set(row.plan, this.rowToLimits(row));
      this.cache = plans;

      const models = new Map<BillingModel, ModelConfig>();
      for (const row of modelRows)
        models.set(row.billingModel, this.rowToModelConfig(row));
      this.modelCache = models;

      this.logger.log(
        `Loaded ${planRows.length} plan configs, ${modelRows.length} billing-model configs`,
      );
    } catch (error) {
      this.logger.error('Failed to load configs; using defaults', error);
    }
  }

  /** Sync accessor for enforcement code. Falls back to compiled defaults. */
  getLimits(plan: OrgPlan): PlanLimits {
    return this.cache.get(plan) ?? PLAN_LIMITS[plan];
  }

  getModelConfig(model: BillingModel): ModelConfig {
    return this.modelCache.get(model) ?? this.defaultModelConfig(model);
  }

  getAllModels(): ModelConfig[] {
    return PlanConfigService.CONFIGURABLE_MODELS.map((m) =>
      this.getModelConfig(m),
    );
  }

  /**
   * The limits/features that actually apply to an organiser, honouring their
   * billing model. FREE and REVENUE_SHARE draw from their own config; the
   * processing fee is 0% for FREE and the organiser's own cut for REVENUE_SHARE
   * (so it flows into the existing payout/fee maths).
   */
  getEffectiveLimits(sub: {
    billingModel: BillingModel;
    plan: OrgPlan;
    revenueSharePercent?: number | { toString(): string } | null;
  }): PlanLimits {
    if (
      sub.billingModel === BillingModel.FREE ||
      sub.billingModel === BillingModel.REVENUE_SHARE
    ) {
      const m = this.getModelConfig(sub.billingModel);
      const fee = this.resolvePlatformFeePercent(sub);
      return {
        spaces: m.spaces,
        eventsPerMonth: m.eventsPerMonth,
        attendeesPerEvent: m.attendeesPerEvent,
        ticketTypes: m.ticketTypes,
        coCurators: m.coCurators,
        hasWaitlist: m.hasWaitlist,
        hasBulkExport: m.hasBulkExport,
        hasAnalytics: m.hasAnalytics,
        hasWhatsappBlast: m.hasWhatsappBlast,
        hasRecurringEvents: m.hasRecurringEvents,
        hasRemoveBranding: m.hasRemoveBranding,
        hasPrioritySupport: m.hasPrioritySupport,
        hasSessions: m.hasSessions,
        hasLeaderboard: m.hasLeaderboard,
        hasCertificates: m.hasCertificates,
        hasSponsors: m.hasSponsors,
        processingFeePercent: fee,
        monthlyPrice: null,
        annualPrice: null,
      };
    }
    return this.getLimits(sub.plan);
  }

  /**
   * Platform fee % an organiser pays out of ticket sales — the single source
   * for payouts, exports and plan limits. Only REVENUE_SHARE pays one: the
   * space's own rate, else the model's default (a null rate is NOT 0%). FREE
   * and SUBSCRIPTION pay 0.
   *
   * MIRRORED in SQL by `platform_fee_percent_for_event` (migration
   * 20261022120000_freeze_platform_fee), which freezes this rate on each sale
   * when it's paid (A21). Change both together: ship a migration that does
   * CREATE OR REPLACE FUNCTION with the new rule.
   */
  resolvePlatformFeePercent(
    sub?: {
      billingModel: BillingModel;
      revenueSharePercent?: number | { toString(): string } | null;
    } | null,
  ): number {
    if (sub?.billingModel !== BillingModel.REVENUE_SHARE) return 0;
    return sub.revenueSharePercent != null
      ? Number(sub.revenueSharePercent)
      : (this.getModelConfig(BillingModel.REVENUE_SHARE).defaultRevenueSharePercent ?? 0);
  }

  /** Admin edit of a Free / Revenue-share config. */
  async updateModel(
    model: BillingModel,
    patch: Partial<Omit<ModelConfig, 'billingModel'>>,
  ): Promise<ModelConfig> {
    const merged: ModelConfig = { ...this.getModelConfig(model), ...patch };
    const data = {
      defaultRevenueSharePercent: merged.defaultRevenueSharePercent,
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
    };
    await this.prisma.billingModelConfig.upsert({
      where: { billingModel: model },
      create: { billingModel: model, ...data },
      update: data,
    });
    this.modelCache.set(model, merged);
    return merged;
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
      processingFeePercent: merged.processingFeePercent,
      monthlyPrice: merged.monthlyPrice,
      annualPrice: merged.annualPrice,
    };
    await this.prisma.planConfig.upsert({
      where: { plan },
      create: { plan, ...data },
      update: data,
    });
    this.cache.set(plan, merged);
    return { plan, ...merged };
  }
}

/** The platform's cut of `gross` at `percent`, rounded to the paise. */
export function platformShare(gross: number, percent: number): number {
  return Math.round(gross * percent + 1e-9) / 100;
}
