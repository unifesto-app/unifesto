import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { PaymentStatus, RegistrationStatus, SessionStatus } from '@prisma/client';
import { JOIN_GRACE_MINUTES_AFTER_END } from './session-policy';
import { emailOptedOutUserIds } from '../email/email-preferences';

/**
 * Time-driven jobs for sessions. For an online session the reminder *is* the
 * product — nobody opens an app to join a Zoom call — so these carry the join
 * link straight to registered attendees.
 *
 * Windows are sized to the cron cadence so each session is caught exactly once
 * without a "reminder sent" flag (matching how EventSchedulerService works, but
 * tightened to avoid the double-send its wider windows allow).
 */
@Injectable()
export class SessionSchedulerService {
  private readonly logger = new Logger(SessionSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly redis: RedisService,
  ) {}

  /** T-24h reminder. Hourly cron, 1-hour window → one send per session. */
  @Cron(CronExpression.EVERY_HOUR)
  async sendDayBeforeReminders(): Promise<void> {
    const now = Date.now();
    await this.remindSessionsStarting(
      new Date(now + 23 * 60 * 60 * 1000),
      new Date(now + 24 * 60 * 60 * 1000),
      'Tomorrow',
    );
  }

  /** T-15m reminder. 5-minute cron, 5-minute window → one send per session. */
  @Cron('*/5 * * * *')
  async sendStartingSoonReminders(): Promise<void> {
    const now = Date.now();
    await this.remindSessionsStarting(
      new Date(now + 13 * 60 * 1000),
      new Date(now + 18 * 60 * 1000),
      'Starting soon',
    );
  }

  private async remindSessionsStarting(from: Date, to: Date, lead: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PUBLISHED,
        startDateTime: { gte: from, lte: to },
      },
    });

    for (const session of sessions) {
      // The window sizing stops a single replica from re-sending, but all 3
      // replicas run this cron tick together. A per-session, per-lead guard
      // (setNx, 6h TTL — well under the gap to this session's next lead window)
      // collapses that to one send. fail-open: a rare dup beats a missed join
      // link for an online session.
      const first = await this.redis.setNx(
        `session:reminder:${lead}:${session.id}`,
        '1',
        6 * 60 * 60,
      );
      if (!first) continue;

      const registrations = await this.prisma.sessionRegistration.findMany({
        where: {
          sessionId: session.id,
          status: RegistrationStatus.REGISTERED,
          paymentStatus: PaymentStatus.PAID,
        },
        include: {
          user: {
            include: {
              identities: {
                where: { email: { not: null } },
                select: { email: true },
                take: 1,
              },
            },
          },
        },
      });

      const optedOut = await emailOptedOutUserIds(
        this.prisma,
        registrations.map((r) => r.userId),
      );

      for (const reg of registrations) {
        const email = reg.user.identities[0]?.email;
        if (!email || optedOut.has(reg.userId)) continue;
        const name = reg.user.fullName || reg.user.username || 'there';
        this.email
          .sendRawEmail(
            email,
            `${lead}: ${session.title}`,
            this.reminderHtml(name, session, lead),
          )
          .catch((err) =>
            this.logger.error('Session reminder email failed', err),
          );
      }

      this.logger.log(
        `Sent "${lead}" reminders for session ${session.id} to ${registrations.length} attendees`,
      );
    }
  }

  private reminderHtml(
    name: string,
    session: { title: string; slug: string; startDateTime: Date; timezone: string },
    lead: string,
  ): string {
    const when = new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: session.timezone,
    }).format(session.startDateTime);
    // Deliberately NOT the raw meeting link. We deep-link to the in-app session
    // page; the "Join" there goes through join(), which gates access (registered
    // + paid + inside the join window) and, for live sessions, mints a per-user
    // token. Emailing the raw URL would hand out a forwardable credential — and
    // for the T-24h reminder, a full day early.
    const joinUrl = `https://unifesto.app/session/${session.slug}`;
    return `
      <p>Hi ${name},</p>
      <p>${lead === 'Tomorrow' ? 'Your session is tomorrow.' : 'Your session is starting soon.'}</p>
      <p><strong>${session.title}</strong><br/>${when}</p>
      <p><a href="${joinUrl}">Open the session</a> — the Join button unlocks shortly before it starts.</p>
    `;
  }

  /**
   * Mark sessions completed once their scheduled end (start + duration) has
   * passed. Duration is per-row, so we filter candidates in JS then update by id.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async markCompletedSessions(): Promise<void> {
    const now = Date.now();
    const candidates = await this.prisma.session.findMany({
      where: {
        status: SessionStatus.PUBLISHED,
        startDateTime: { lte: new Date(now) },
      },
      select: { id: true, startDateTime: true, durationMinutes: true },
    });

    // Auto-complete only after the join grace has also passed, so a session
    // running slightly over its scheduled end isn't ended out from under a live
    // room. The organiser can always end it early via completeSession().
    const graceMs = JOIN_GRACE_MINUTES_AFTER_END * 60_000;
    const endedIds = candidates
      .filter(
        (s) =>
          s.startDateTime.getTime() + s.durationMinutes * 60_000 + graceMs <=
          now,
      )
      .map((s) => s.id);

    if (endedIds.length === 0) return;

    const result = await this.prisma.session.updateMany({
      where: { id: { in: endedIds } },
      data: { status: SessionStatus.COMPLETED },
    });
    this.logger.log(`Marked ${result.count} sessions as COMPLETED`);
  }
}
