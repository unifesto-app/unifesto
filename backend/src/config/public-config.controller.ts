import { Controller, Get } from '@nestjs/common';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PlanConfigService, SELLABLE_PLANS } from '../subscription/plan-config.service';
import { PLAN_CATALOG, PLAN_TAGLINES } from '../subscription/plan-limits.config';

/**
 * Public, unauthenticated read of platform settings that clients need in order
 * to render pricing (e.g. the app-wide processing fee shown at checkout).
 */
@Controller('config')
export class PublicConfigController {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly planConfig: PlanConfigService,
  ) {}

  @Get('processing-fee')
  getProcessingFee() {
    return {
      processingFeePercent: this.platformConfig.getProcessingFeePercent(),
      processingFeeCapPerTicket: this.platformConfig.getProcessingFeeCapPerTicket(),
    };
  }

  /**
   * The public rate card (A9, D10, T10): each plan's price, platform fee per
   * paid ticket, limits, feature flags and tagline, the full feature catalog,
   * plus the buyer's processing fee. The marketing site's /pricing reads this, so it always
   * shows what is actually charged.
   */
  @Get('plan-fees')
  getPlanFees() {
    return {
      buyerProcessingFeePercent: this.platformConfig.getProcessingFeePercent(),
      buyerProcessingFeeCapPerTicket: this.platformConfig.getProcessingFeeCapPerTicket(),
      // The whole plan_configs row (T10): /pricing renders limits and
      // features from it too, so the site can't drift from what's enforced.
      plans: SELLABLE_PLANS.map((plan) => ({ plan, tagline: PLAN_TAGLINES[plan], ...this.planConfig.getLimits(plan) })),
      // Every feature, grouped, with the flag or limit that gates it (none =
      // every plan). Apex, Space billing and /pricing all render this list.
      catalog: PLAN_CATALOG,
    };
  }
}
