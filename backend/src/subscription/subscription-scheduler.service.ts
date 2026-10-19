import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CacheService } from '../cache/cache.service';
import { RedisService } from '../redis/redis.service';
import { OrgPlan, Prisma } from '@prisma/client';

const emailIdentity = {
  identities: {
    where: { email: { not: null } },
    select: { email: true },
    take: 1,
  },
} as const;

// Billing emails for a space go to its accountable admin (the space creator).
const RECIPIENT_INCLUDE = {
  space: {
    select: {
      creator: { select: { fullName: true, username: true, ...emailIdentity } },
    },
  },
} satisfies Prisma.OrgSubscriptionInclude;

type BillingRow = Prisma.OrgSubscriptionGetPayload<{
  include: typeof RECIPIENT_INCLUDE;
}>;

@Injectable()
export class SubscriptionSchedulerService {
  private readonly logger = new Logger(SubscriptionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly cache: CacheService,
    private readonly redis: RedisService,
  ) {}

  /** Date bucket (IST) so each day's run locks independently of the next. */
  private dayKey(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  /** Billing emails go to the space's accountable admin (its creator). */
  private resolveRecipient(sub: BillingRow): {
    email: string | null;
    name: string;
  } {
    const person = sub.space?.creator ?? null;
    return {
      email: person?.identities[0]?.email ?? null,
      name: person?.fullName || person?.username || 'there',
    };
  }

  /** Invalidate whichever plan cache key this row feeds. */
  private async invalidatePlan(sub: BillingRow): Promise<void> {
    if (sub.spaceId) await this.cache.invalidateSpacePlanCache(sub.spaceId);
  }

  /**
   * Job 1: Handle expired subscriptions
   * Runs: Daily at midnight
   * Finds: Active paid subscriptions that have expired
   * Action: Downgrade to STARTER and send emails
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredSubscriptions(): Promise<void> {
    // Fail-closed: all replicas would otherwise findMany the same expired rows
    // and each mail the payer twice before any commits the downgrade.
    const ran = await this.redis.runExclusive(
      `cron:subExpired:${this.dayKey()}`,
      12 * 60 * 60,
      () => this.runHandleExpiredSubscriptions(),
      { failOpen: false },
    );
    if (!ran) this.logger.log('Expired-subscriptions job skipped (another replica ran it)');
  }

  private async runHandleExpiredSubscriptions(): Promise<void> {
    this.logger.log('Starting expired subscriptions job...');

    const now = new Date();

    const expired = await this.prisma.orgSubscription.findMany({
      where: {
        expiresAt: { lte: now },
        isActive: true,
        plan: { not: OrgPlan.STARTER },
      },
      include: RECIPIENT_INCLUDE,
    });

    for (const sub of expired) {
      const oldPlan = sub.plan;

      // Update subscription to STARTER
      await this.prisma.orgSubscription.update({
        where: { id: sub.id },
        data: {
          plan: OrgPlan.STARTER,
          isActive: false,
          cancelledAt: now,
        },
      });

      // Invalidate whichever plan cache this row feeds
      await this.invalidatePlan(sub);

      const { email, name } = this.resolveRecipient(sub);
      if (email) {
        // Send subscription expired email
        this.emailService
          .sendSubscriptionExpired({
            email,
            userName: name,
            plan: oldPlan,
            downgradedTo: 'STARTER',
          })
          .catch((err) =>
            this.logger.error('Subscription expired email failed', err),
          );

        // Send subscription downgraded email
        this.emailService
          .sendSubscriptionDowngraded({
            email,
            userName: name,
            fromPlan: oldPlan,
            toPlan: 'STARTER',
          })
          .catch((err) =>
            this.logger.error('Subscription downgraded email failed', err),
          );
      }

      this.logger.log(
        `Downgraded subscription ${sub.id} from ${oldPlan} to STARTER`,
      );
    }

    this.logger.log(
      `Expired subscriptions job completed. Downgraded ${expired.length} subscriptions`,
    );
  }

  /**
   * Job 2: Send expiring subscription warnings
   * Runs: Daily at 9 AM IST
   * Finds: Subscriptions expiring in 7 days
   * Action: Send reminder email
   */
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata' })
  async sendExpiringSubscriptionWarnings(): Promise<void> {
    const ran = await this.redis.runExclusive(
      `cron:subExpiring:${this.dayKey()}`,
      12 * 60 * 60,
      () => this.runSendExpiringSubscriptionWarnings(),
      { failOpen: false },
    );
    if (!ran) this.logger.log('Expiring-subscription warnings job skipped (another replica ran it)');
  }

  private async runSendExpiringSubscriptionWarnings(): Promise<void> {
    this.logger.log('Starting expiring subscription warnings job...');

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in6Days = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    const expiring = await this.prisma.orgSubscription.findMany({
      where: {
        expiresAt: { gte: in6Days, lte: in7Days },
        isActive: true,
        plan: { not: OrgPlan.STARTER },
      },
      include: RECIPIENT_INCLUDE,
    });

    for (const sub of expiring) {
      const { email, name } = this.resolveRecipient(sub);
      if (email && sub.expiresAt) {
        this.emailService
          .sendSubscriptionExpiring({
            email,
            userName: name,
            plan: sub.plan,
            expiresAt: this.formatDate(sub.expiresAt),
            renewUrl: 'https://space.unifesto.app/dashboard/billing',
          })
          .catch((err) =>
            this.logger.error('Subscription expiring email failed', err),
          );
      }
    }

    this.logger.log(
      `Expiring subscription warnings job completed. Sent ${expiring.length} warnings`,
    );
  }

  /**
   * Job 3: Reset monthly event counts
   * Runs: 1st of every month at midnight
   * Action: Reset eventsThisMonth counter for all subscriptions
   */
  @Cron('0 0 1 * *')
  async resetMonthlyEventCounts(): Promise<void> {
    await this.redis.runExclusive(`cron:monthlyReset:${this.dayKey()}`, 12 * 60 * 60, () =>
      this.runResetMonthlyEventCounts(),
    );
  }

  private async runResetMonthlyEventCounts(): Promise<void> {
    this.logger.log('Starting monthly event count reset job...');

    const result = await this.prisma.orgSubscription.updateMany({
      data: {
        eventsThisMonth: 0,
        usageResetAt: new Date(),
      },
    });

    this.logger.log(
      `Monthly event count reset completed. Reset ${result.count} subscriptions`,
    );
  }

  /**
   * Helper: Format date for display
   * Output: "7 June 2026"
   */
  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  }
}
