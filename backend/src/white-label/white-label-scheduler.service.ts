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

  /** Every replica fires; a setNx lease lets one run the sweep. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (!(await this.redis.setNx('white-label:domain:sweep', '1', 50 * 60))) return;
    try {
      const r = await this.whiteLabel.sweepDomains();
      if (r.expired || r.lapsed) this.logger.log(`Domain sweep: ${JSON.stringify(r)}`);
    } catch (err) {
      this.logger.error('Domain sweep failed', err as Error);
    }
  }
}
