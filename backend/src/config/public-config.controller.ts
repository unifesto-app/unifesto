import { Controller, Get, NotFoundException, ParseUUIDPipe, Query } from '@nestjs/common';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PlanConfigService, SELLABLE_PLANS } from '../subscription/plan-config.service';
import { TermsService } from '../subscription/terms.service';
import { PLAN_CATALOG, PLAN_TAGLINES } from '../subscription/plan-limits.config';
import { paymentMethods } from './razorpay-methods';

/**
 * Public, unauthenticated read of platform settings that clients need in order
 * to render pricing (e.g. the app-wide processing fee shown at checkout).
 */
@Controller('config')
export class PublicConfigController {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly planConfig: PlanConfigService,
    private readonly terms: TermsService,
  ) {}

  /**
   * The buyer fee terms. With `eventId`: that event's own (its space's plan or
   * deal, T4), what checkout charges, so the app's estimate matches. Without:
   * the platform rate card, for older apps.
   */
  @Get('processing-fee')
  async getProcessingFee(@Query('eventId', new ParseUUIDPipe({ optional: true })) eventId?: string) {
    if (eventId) {
      const t = await this.terms.forEvent(eventId).catch(() => {
        throw new NotFoundException('Event not found');
      });
      return {
        processingFeePercent: t.buyerFeeBps / 100,
        processingFeeCapPerTicket: t.buyerFeeCapPaise == null ? null : t.buyerFeeCapPaise / 100,
      };
    }
    return {
      processingFeePercent: this.platformConfig.getProcessingFeePercent(),
      processingFeeCapPerTicket: this.platformConfig.getProcessingFeeCapPerTicket(),
    };
  }

  /**
   * Q40: where the app and site may show their own UPI-first checkout. Off
   * means Razorpay Standard Checkout only (the kill switch). Clients fall back
   * to Standard Checkout when this can't be read. `applePay`: the iPhone pay
   * page may offer Apple Pay.
   */
  @Get('checkout')
  getCheckout() {
    return this.platformConfig.getUpiCheckout();
  }

  /**
   * Q40: the netbanking banks and wallets the payment page may list, and our
   * public key (every checkout already carries it) so the app can check a
   * typed UPI ID before an order exists.
   */
  @Get('payment-methods')
  async getPaymentMethods() {
    return { ...(await paymentMethods()), keyId: process.env.RAZORPAY_KEY_ID };
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
