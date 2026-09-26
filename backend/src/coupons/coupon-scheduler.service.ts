import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { CouponsService } from './coupons.service';

/**
 * Releases coupon slots whose checkout was started but never paid within the
 * reservation TTL. Without this, an abandoned paid checkout that never returns
 * to re-register would hold its slot against a limited coupon's hard cap
 * forever.
 */
@Injectable()
export class CouponSchedulerService {
  private readonly logger = new Logger(CouponSchedulerService.name);

  constructor(
    private readonly coupons: CouponsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Every 5 minutes. All replicas fire this tick together, so a short-lived
   * setNx lease lets exactly one replica run the sweep — the release itself is
   * race-safe, but the lease avoids three replicas scanning the same rows.
   */
  @Cron('*/5 * * * *')
  async sweep(): Promise<void> {
    const leader = await this.redis.setNx('coupon:reservation:sweep', '1', 240);
    if (!leader) return;
    try {
      await this.coupons.sweepExpiredReservations();
    } catch (err) {
      this.logger.error('Coupon reservation sweep failed', err as Error);
    }
  }
}
