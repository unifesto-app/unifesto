import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { UsersService } from './users.service';

/**
 * Closes accounts whose 30-day deletion grace period has run out, so a
 * deletion request completes on its own without anyone acting on it.
 */
@Injectable()
export class AccountDeletionSchedulerService {
  private readonly logger = new Logger(AccountDeletionSchedulerService.name);

  constructor(
    private readonly users: UsersService,
    private readonly redis: RedisService,
  ) {}

  /** Daily at 03:30 IST, one replica. */
  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async purge(): Promise<void> {
    // Fail closed: a Redis outage delays a purge by a night rather than running it three times at once.
    await this.redis.runExclusive(
      'users:deletion:purge',
      60 * 60,
      async () => {
        const { closed, blocked } = await this.users.purgeDueDeletions();
        if (closed || blocked) {
          this.logger.log(
            `Account deletion purge: ${closed} closed, ${blocked} blocked`,
          );
        }
      },
      { failOpen: false },
    );
  }
}
