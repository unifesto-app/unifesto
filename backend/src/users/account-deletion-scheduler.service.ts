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

  /**
   * Daily at 03:30 IST. All replicas fire this tick together, so a setNx
   * lease lets exactly one replica run the purge.
   */
  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' })
  async purge(): Promise<void> {
    const leader = await this.redis.setNx('users:deletion:purge', '1', 3600);
    if (!leader) return;
    try {
      const { closed, blocked } = await this.users.purgeDueDeletions();
      if (closed || blocked) {
        this.logger.log(`Account deletion purge: ${closed} closed, ${blocked} blocked`);
      }
    } catch (err) {
      this.logger.error('Account deletion purge failed', err as Error);
    }
  }
}
