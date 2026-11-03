import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { WhiteLabelService } from './white-label.service';

/**
 * Hourly domain upkeep (H25): drops never-verified claims past their TTL and
 * re-reads verified sending/web domains from Resend and Cloudflare, so a DNS
 * change stops branded mail and pages instead of failing silently.
 */
@Injectable()
export class WhiteLabelSchedulerService {
  private readonly logger = new Logger(WhiteLabelSchedulerService.name);

  constructor(
    private readonly whiteLabel: WhiteLabelService,
    private readonly redis: RedisService,
  ) {}

  /** Hourly, one replica. Fails closed: a Redis outage skips an hour rather than calling Cloudflare and Resend three times. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    await this.redis.runExclusive(
      'white-label:domain:sweep',
      50 * 60,
      async () => {
        const r = await this.whiteLabel.sweepDomains();
        if (r.expired || r.lapsed)
          this.logger.log(`Domain sweep: ${JSON.stringify(r)}`);
      },
      { failOpen: false },
    );
  }
}
