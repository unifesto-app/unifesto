import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { FeedbackService } from './feedback.service';

/** F2: every 15 minutes, send the feedback requests and reminders that are due. */
@Injectable()
export class FeedbackSchedulerService {
  private readonly logger = new Logger(FeedbackSchedulerService.name);

  constructor(
    private readonly feedback: FeedbackService,
    private readonly redis: RedisService,
  ) {}

  /** Every replica fires; a setNx lease lets one run the sweep. */
  @Cron('*/15 * * * *')
  async sweep(): Promise<void> {
    if (!(await this.redis.setNx('feedback:sweep', '1', 14 * 60))) return;
    try {
      const { sent } = await this.feedback.sendDue();
      if (sent) this.logger.log(`Feedback sweep: ${sent} asks sent`);
    } catch (err) {
      this.logger.error('Feedback sweep failed', err as Error);
    }
  }
}
