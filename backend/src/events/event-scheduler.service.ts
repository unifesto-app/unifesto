import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RedisService } from '../redis/redis.service';
import { NOT_DELETED } from '../common/soft-delete';
import { emailOptedOutUserIds } from '../email/email-preferences';
import { forEachPage, inChunks } from '../common/batching';
import { CLAIMED_MEMBER_SEAT, COUNTS_AS_ATTENDING } from '../common/attendance';

type Person = {
  id: string;
  fullName: string | null;
  username: string | null;
  identities: { email: string | null }[];
};

/** What the reminder jobs read per booking. */
export type ReminderBooking = {
  userId: string;
  qrCode: string;
  user: Person;
  tickets: { ticketCode: string; qrCode: string; attendeeEmail: string | null }[];
  groupSeats: { claimedBy: Person | null }[];
};

export type ReminderRecipient = {
  userId: string;
  email: string | undefined;
  name: string;
  qrCode: string;
  ticketCode?: string;
};

/**
 * The people one attending booking reaches, each with their own pass: the
 * holder with the booking's QR, then each group member who joined with the
 * seat ticket stamped with their email (A28). A member with no ticket of their
 * own is skipped rather than sent the group's QR.
 */
export function reminderRecipients(reg: ReminderBooking): ReminderRecipient[] {
  const name = (u: Person) => u.fullName || u.username || 'there';
  const leadTicket = reg.tickets.find((t) => !t.attendeeEmail) ?? reg.tickets[0];
  const out: ReminderRecipient[] = [
    {
      userId: reg.userId,
      email: reg.user.identities[0]?.email ?? undefined,
      name: name(reg.user),
      qrCode: reg.qrCode,
      ticketCode: leadTicket?.ticketCode,
    },
  ];
  for (const { claimedBy: m } of reg.groupSeats) {
    if (!m || m.id === reg.userId) continue;
    const emails = m.identities.map((i) => i.email?.toLowerCase()).filter(Boolean);
    const ticket = reg.tickets.find(
      (t) => t.attendeeEmail && emails.includes(t.attendeeEmail.toLowerCase()),
    );
    if (!ticket) continue;
    out.push({
      userId: m.id,
      email: m.identities[0]?.email ?? undefined,
      name: name(m),
      qrCode: ticket.qrCode,
      ticketCode: ticket.ticketCode,
    });
  }
  return out;
}

const PERSON = {
  id: true,
  fullName: true,
  username: true,
  identities: {
    where: { email: { not: null } },
    orderBy: { isPrimary: 'desc' as const },
    select: { email: true },
  },
};

@Injectable()
export class EventSchedulerService {
  private readonly logger = new Logger(EventSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Job 1: Send event reminders 24 hours before event
   * Runs: Every hour
   * Finds: Events starting in 23-25 hours
   *
   * The 23–25h window is 2h wide but the cron fires hourly, so the same event
   * matches in up to 3 consecutive runs — and each of the 3 replicas runs its
   * own copy of the cron. A per-event Redis guard (setNx, 3-day TTL) collapses
   * all of that to one email reminder per event, mirroring the T-24h
   * push reminder in PushSchedulerService. Keyed separately from the push guard
   * so the two channels each still fire once.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendEventReminders(): Promise<void> {
    this.logger.log('Starting event reminder job...');

    const now = new Date();
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const events = await this.prisma.event.findMany({
      where: {
        ...NOT_DELETED,
        startDateTime: { gte: in23Hours, lte: in25Hours },
        status: 'PUBLISHED',
      },
    });

    for (const event of events) {
      const first = await this.redis.setNx(
        `event:reminder:email:${event.id}`,
        '1',
        3 * 24 * 60 * 60,
      );
      if (!first) continue; // already reminded (another replica / earlier run)

      let sent = 0;
      // A page of attendees at a time, a few sends in flight at once.
      await forEachPage(
        (page) =>
          this.prisma.eventRegistration.findMany({
            ...page,
            where: { eventId: event.id, ...COUNTS_AS_ATTENDING },
            select: {
              id: true,
              userId: true,
              qrCode: true,
              user: { select: PERSON },
              tickets: { select: { ticketCode: true, qrCode: true, attendeeEmail: true } },
              groupSeats: { where: CLAIMED_MEMBER_SEAT, select: { claimedBy: { select: PERSON } } },
            },
          }),
        async (registrations) => {
          const people = registrations.flatMap(reminderRecipients);
          const optedOut = await emailOptedOutUserIds(
            this.prisma,
            people.map((r) => r.userId),
          );
          sent += people.length;

          await inChunks(people, async (to) => {
            const email = optedOut.has(to.userId) ? undefined : to.email;

            // Email reminder
            if (email) {
              await this.emailService
                .sendEventReminder({
                  email,
                  userName: to.name,
                  eventId: event.id,
                  eventTitle: event.title,
                  eventDate: this.formatDate(event.startDateTime),
                  eventTime: this.formatTime(
                    event.startDateTime,
                    event.endDateTime,
                  ),
                  venueName: event.venueName || undefined,
                  city: event.city || undefined,
                  isOnline: event.type === 'ONLINE',
                  onlineUrl: event.onlineUrl || undefined,
                  qrCode: to.qrCode,
                  ticketCode: to.ticketCode,
                })
                .catch((err) =>
                  this.logger.error('Event reminder email failed', err),
                );
            }
          });
        },
      );

      this.logger.log(
        `Sent reminders for event ${event.id} to ${sent} attendees`,
      );
    }

    this.logger.log(
      `Event reminder job completed. Processed ${events.length} events`,
    );
  }

  /**
   * Job 2: Send "event starting soon" notifications 1 hour before
   * Runs: Every 15 minutes
   * Finds: Events starting in 55-65 minutes
   */
  @Cron('*/15 * * * *')
  async sendEventStartingSoonNotifications(): Promise<void> {
    this.logger.log('Starting event starting soon job...');

    const now = new Date();
    const in55Min = new Date(now.getTime() + 55 * 60 * 1000);
    const in65Min = new Date(now.getTime() + 65 * 60 * 1000);

    const events = await this.prisma.event.findMany({
      where: {
        ...NOT_DELETED,
        startDateTime: { gte: in55Min, lte: in65Min },
        status: 'PUBLISHED',
      },
    });

    for (const event of events) {
      const first = await this.redis.setNx(
        `event:startingsoon:${event.id}`,
        '1',
        3 * 60 * 60,
      );
      if (!first) continue; // already notified (another replica / overlapping run)

      let sent = 0;
      await forEachPage(
        (page) =>
          this.prisma.eventRegistration.findMany({
            ...page,
            where: { eventId: event.id, ...COUNTS_AS_ATTENDING },
            select: {
              id: true,
              userId: true,
              qrCode: true,
              user: { select: PERSON },
              tickets: { select: { ticketCode: true, qrCode: true, attendeeEmail: true } },
              groupSeats: { where: CLAIMED_MEMBER_SEAT, select: { claimedBy: { select: PERSON } } },
            },
          }),
        async (registrations) => {
          const people = registrations.flatMap(reminderRecipients);
          const optedOut = await emailOptedOutUserIds(
            this.prisma,
            people.map((r) => r.userId),
          );
          sent += people.length;

          await inChunks(people, async (to) => {
            const email = optedOut.has(to.userId) ? undefined : to.email;
            if (email) {
              await this.emailService
                .sendEventStartingSoon({
                  email,
                  userName: to.name,
                  eventId: event.id,
                  eventTitle: event.title,
                  startsInMinutes: 60,
                  venueName: event.venueName || undefined,
                  city: event.city || undefined,
                  isOnline: event.type === 'ONLINE',
                  onlineUrl: event.onlineUrl || undefined,
                  qrCode: to.qrCode,
                })
                .catch((err) =>
                  this.logger.error('Event starting soon email failed', err),
                );
            }
          });
        },
      );

      this.logger.log(
        `Sent starting soon notifications for event ${event.id} to ${sent} attendees`,
      );
    }

    this.logger.log(
      `Event starting soon job completed. Processed ${events.length} events`,
    );
  }

  /**
   * Job 3: Mark completed events
   * Runs: Every hour
   * Finds: Live events (PUBLISHED or ONGOING) whose endDateTime has passed.
   * ONGOING must be included too — an event that started but was never flipped
   * here would otherwise stay ONGOING forever and keep surfacing in check-in.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async markCompletedEvents(): Promise<void> {
    await this.redis.runExclusive('cron:eventsComplete', 50 * 60, () =>
      this.runMarkCompletedEvents(),
    );
  }

  private async runMarkCompletedEvents(): Promise<void> {
    this.logger.log('Starting mark completed events job...');

    const now = new Date();

    const result = await this.prisma.event.updateMany({
      where: {
        endDateTime: { lte: now },
        status: { in: ['PUBLISHED', 'ONGOING'] },
        // A series parent's dates are only its first slot (A29): completing it
        // would stop the series extending, and its occurrences complete on
        // their own.
        isRecurring: false,
      },
      data: { status: 'COMPLETED' },
    });

    if (result.count > 0) {
      this.logger.log(`Marked ${result.count} events as COMPLETED`);
    } else {
      this.logger.log('No events to mark as completed');
    }
  }

  /**
   * Job 4: Send event summaries to attendees post-event
   * Runs: Every hour
   * Finds: Events that completed in the last 1-2 hours
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sendEventSummaries(): Promise<void> {
    this.logger.log('Starting event summary job...');

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const completedEvents = await this.prisma.event.findMany({
      where: {
        // COMPLETED is one of the two states an organiser can hide, so this is
        // the one scheduled job that can actually collide with a hidden event.
        // Mailing attendees a summary of something the organiser just hid would
        // undo the hiding in the most visible way possible.
        ...NOT_DELETED,
        endDateTime: { gte: twoHoursAgo, lte: oneHourAgo },
        status: 'COMPLETED',
      },
    });

    for (const event of completedEvents) {
      const first = await this.redis.setNx(
        `event:summary:${event.id}`,
        '1',
        3 * 24 * 60 * 60,
      );
      if (!first) continue; // already summarised (another replica / overlapping run)

      let sent = 0;
      await forEachPage(
        (page) =>
          this.prisma.eventRegistration.findMany({
            ...page,
            where: {
              eventId: event.id,
              status: 'ATTENDED',
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
          }),
        async (attendees) => {
          const optedOut = await emailOptedOutUserIds(
            this.prisma,
            attendees.map((r) => r.userId),
          );
          sent += attendees.length;

          await inChunks(attendees, async (reg) => {
            const email = optedOut.has(reg.userId)
              ? undefined
              : reg.user.identities[0]?.email;
            if (email) {
              await this.emailService
                .sendEventSummary({
                  email,
                  userName: reg.user.fullName || reg.user.username || 'there',
                  eventTitle: event.title,
                  attendeeCount: event.registeredCount,
                })
                .catch((err) =>
                  this.logger.error('Event summary email failed', err),
                );
            }
          });
        },
      );

      this.logger.log(
        `Sent event summaries for ${event.id} to ${sent} attendees`,
      );
    }

    this.logger.log(
      `Event summary job completed. Processed ${completedEvents.length} events`,
    );
  }

  /**
   * Helper: Format date for display
   * Output: "7 June 2026"
   */
  private formatDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }).format(dateTime);
  }

  /**
   * Helper: Format time range
   * Output: "10:00 AM - 1:00 PM IST"
   */
  private formatTime(
    startTime: Date,
    endTime: Date,
    timezone = 'Asia/Kolkata',
  ): string {
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      }).format(d);

    return `${fmt(startTime)} - ${fmt(endTime)} IST`;
  }
}
