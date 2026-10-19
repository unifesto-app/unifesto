import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EmailCampaignsService } from '../email-campaigns/email-campaigns.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminSchedulerService {
  private readonly logger = new Logger(AdminSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly campaigns: EmailCampaignsService,
    private readonly whatsapp: WhatsAppService,
    private readonly redis: RedisService,
  ) {}

  /** Date bucket (IST) so a given day's run is locked independently of the next. */
  private dayKey(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  @Cron('0 8 * * *', { timeZone: 'Asia/Kolkata' })
  async sendDailyAdminDigest(): Promise<void> {
    // Broadcast job: fail-closed so a Redis outage skips the run rather than
    // letting all replicas send the digest + WhatsApp stats 3×.
    const ran = await this.redis.runExclusive(
      `cron:adminDigest:${this.dayKey()}`,
      12 * 60 * 60,
      () => this.runDailyAdminDigest(),
      { failOpen: false },
    );
    if (!ran) this.logger.log('Daily admin digest skipped (another replica ran it)');
  }

  private async runDailyAdminDigest(): Promise<void> {
    this.logger.log('Running daily admin digest...');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [newUsers, newSpaces, newEvents, registrations, revenue] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: yesterday } } }),
      this.prisma.space.count({ where: { createdAt: { gte: yesterday } } }),
      this.prisma.event.count({ where: { createdAt: { gte: yesterday } } }),
      this.prisma.eventRegistration.count({ where: { registeredAt: { gte: yesterday } } }),
      this.prisma.eventRegistration.aggregate({
        where: { registeredAt: { gte: yesterday }, paymentStatus: 'PAID' },
        _sum: { razorpayAmount: true }
      }),
    ]);

    const adminEmail = process.env.ADMIN_EMAIL || 'aws@unifesto.app';
    await this.emailService.sendDailyAdminDigest({
      adminEmail,
      date: now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }),
      newUsers,
      newSpaces,
      newEvents,
      totalRegistrations: registrations,
      totalRevenue: Number(revenue._sum.razorpayAmount || 0),
      activeUsers: newUsers,
    }).catch(err => this.logger.error('Daily digest failed', err));

    // Same numbers, second channel: broadcast to the "Unifesto Stats" WhatsApp list.
    await this.whatsapp.broadcastStatsUpdate({
      label: 'Daily Snapshot',
      periodText: now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }),
      newUsers,
      newSpaces,
      newEvents,
      registrations,
      revenue: Number(revenue._sum.razorpayAmount || 0),
    }).catch(err => this.logger.error('Daily stats WhatsApp broadcast failed', err));

    this.logger.log('Daily admin digest sent');
  }

  @Cron('0 9 * * 1', { timeZone: 'Asia/Kolkata' })
  async sendWeeklyReport(): Promise<void> {
    const ran = await this.redis.runExclusive(
      `cron:weeklyReport:${this.dayKey()}`,
      12 * 60 * 60,
      () => this.runWeeklyReport(),
      { failOpen: false },
    );
    if (!ran) this.logger.log('Weekly report skipped (another replica ran it)');
  }

  private async runWeeklyReport(): Promise<void> {
    this.logger.log('Running weekly report...');
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, newUsers, totalEvents, newEvents, revenue, registrations, newSpaces] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.event.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.event.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.eventRegistration.aggregate({
        where: { registeredAt: { gte: weekAgo }, paymentStatus: 'PAID' },
        _sum: { razorpayAmount: true }
      }),
      this.prisma.eventRegistration.count({ where: { registeredAt: { gte: weekAgo } } }),
      this.prisma.space.count({ where: { createdAt: { gte: weekAgo } } }),
    ]);

    const adminEmail = process.env.ADMIN_EMAIL || 'aws@unifesto.app';
    await this.emailService.sendWeeklyReport({
      adminEmail,
      weekStarting: weekAgo.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }),
      metrics: [
        { label: 'Total Users', value: totalUsers.toLocaleString(), change: `+${newUsers} this week` },
        { label: 'Active Events', value: totalEvents.toLocaleString(), change: `+${newEvents} this week` },
        { label: 'Registrations', value: registrations.toLocaleString(), change: 'this week' },
        { label: 'Revenue', value: `₹${Number(revenue._sum.razorpayAmount || 0).toFixed(2)}`, change: 'this week' },
      ],
    }).catch(err => this.logger.error('Weekly report failed', err));

    await this.whatsapp.broadcastStatsUpdate({
      label: 'Weekly Digest',
      periodText: `${weekAgo.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}–${now.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })}`,
      newUsers,
      newSpaces,
      newEvents,
      registrations,
      revenue: Number(revenue._sum.razorpayAmount || 0),
    }).catch(err => this.logger.error('Weekly stats WhatsApp broadcast failed', err));

    this.logger.log('Weekly report sent');
  }

  @Cron('0 7 1 * *', { timeZone: 'Asia/Kolkata' })
  async sendMonthlyInvoiceSummary(): Promise<void> {
    const ran = await this.redis.runExclusive(
      `cron:monthlyInvoice:${this.dayKey()}`,
      12 * 60 * 60,
      () => this.runMonthlyInvoiceSummary(),
      { failOpen: false },
    );
    if (!ran) this.logger.log('Monthly invoice summary skipped (another replica ran it)');
  }

  private async runMonthlyInvoiceSummary(): Promise<void> {
    this.logger.log('Running monthly invoice summary...');
    const now = new Date();
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [revenue, transactions, topEvents] = await Promise.all([
      this.prisma.eventRegistration.aggregate({
        where: { registeredAt: { gte: firstOfLastMonth, lte: firstOfThisMonth }, paymentStatus: 'PAID' },
        _sum: { razorpayAmount: true }
      }),
      this.prisma.eventRegistration.count({
        where: { registeredAt: { gte: firstOfLastMonth, lte: firstOfThisMonth }, paymentStatus: 'PAID' }
      }),
      this.prisma.event.findMany({
        where: { createdAt: { gte: firstOfLastMonth, lte: firstOfThisMonth } },
        orderBy: { registeredCount: 'desc' },
        take: 5,
        select: { title: true, registeredCount: true }
      })
    ]);

    const adminEmail = process.env.ADMIN_EMAIL || 'aws@unifesto.app';
    await this.emailService.sendMonthlyInvoiceSummary({
      adminEmail,
      month: firstOfLastMonth.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' }),
      totalRevenue: Number(revenue._sum.razorpayAmount || 0),
      totalTransactions: transactions,
      topEvents: topEvents.map(e => ({ title: e.title, revenue: e.registeredCount * 499 })),
    }).catch(err => this.logger.error('Monthly summary failed', err));

    this.logger.log('Monthly invoice summary sent');
  }

  @Cron('*/10 * * * *')
  async processScheduledCampaigns(): Promise<void> {
    const now = new Date();
    const campaigns = await this.prisma.emailCampaign.findMany({
      where: { status: 'SCHEDULED', scheduledAt: { lte: now } },
      take: 5,
    });

    for (const campaign of campaigns) {
      // Per-campaign lock: without it all replicas pick the same SCHEDULED row
      // and send it 3×. fail-open default is fine — processCampaign now also
      // claims the row atomically (SCHEDULED→SENDING), so a Redis-down duplicate
      // still gets caught there. TTL covers the send; the row leaves SCHEDULED.
      await this.redis.runExclusive(
        `cron:campaign:${campaign.id}`,
        30 * 60,
        async () => {
          this.logger.log(`Processing scheduled campaign ${campaign.id}`);
          // Scope-agnostic: processes both platform and space scheduled campaigns.
          await this.campaigns
            .processScheduledCampaign(campaign.id)
            .catch((err) =>
              this.logger.error(`Campaign ${campaign.id} failed`, err),
            );
        },
      );
    }

    // Resume campaigns a deploy or crash left stuck in SENDING.
    await this.redis.runExclusive('cron:campaignStaleSweep', 9 * 60, async () => {
      await this.campaigns.sweepStaleCampaigns();
    });
  }
}
