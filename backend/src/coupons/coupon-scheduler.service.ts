import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly coupons: CouponsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Every 5 minutes, one replica. Fails open: the release is race-safe, and a
   * Redis outage that skipped ticks would keep limited coupons falsely sold out.
   */
  @Cron('*/5 * * * *')
  async sweep(): Promise<void> {
    await this.redis.runExclusive(
      'coupon:reservation:sweep',
      4 * 60,
      async () => {
        await this.coupons.sweepExpiredReservations();
      },
    );
  }
}
