import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PlanConfigService, SELLABLE_PLANS } from '../subscription/plan-config.service';

/**
 * Public, unauthenticated read of platform settings that clients need in order
 * to render pricing (e.g. the app-wide processing fee shown at checkout).
 */
@ApiTags('Config')
@Controller('config')
export class PublicConfigController {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly planConfig: PlanConfigService,
  ) {}

  @Get('processing-fee')
  @ApiOperation({ summary: 'Get the app-wide processing fee percentage' })
  getProcessingFee() {
    return {
      processingFeePercent: this.platformConfig.getProcessingFeePercent(),
      processingFeeCapPerTicket: this.platformConfig.getProcessingFeeCapPerTicket(),
    };
  }

  /**
   * The public rate card (A9, D10, T10): each sellable plan's price, platform
   * fee per paid ticket, limits and feature flags, plus the buyer's
   * processing fee. The marketing site's /pricing reads this, so it always
   * shows what is actually charged.
   */
  @Get('plan-fees')
  @ApiOperation({ summary: 'Get sellable plans: prices, platform fees, limits and features (public rate card)' })
  getPlanFees() {
    return {
      buyerProcessingFeePercent: this.platformConfig.getProcessingFeePercent(),
      buyerProcessingFeeCapPerTicket: this.platformConfig.getProcessingFeeCapPerTicket(),
      // The whole plan_configs row (T10): /pricing renders limits and
      // features from it too, so the site can't drift from what's enforced.
      plans: SELLABLE_PLANS.map((plan) => ({ plan, ...this.planConfig.getLimits(plan) })),
    };
  }
}
