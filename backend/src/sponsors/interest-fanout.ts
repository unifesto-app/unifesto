import { LeadSource, LeadStatus } from '@prisma/client';
import type { EmailService } from '../email/email.service';
import type { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import { forEachPage, inChunks } from '../common/batching';
import { reportError } from '../common/observability';
import { formatEventDate, formatEventTime } from '../events/event-dates';

type Change = { field: string; oldValue: string; newValue: string };

/**
 * E9: "Notify me" promises updates and reminders, so the people who tapped it
 * (EVENT_INTEREST leads) hear about the same two moments attendees do: a date
 * or venue change (`changes`) and the day-before reminder (no `changes`).
 * Anyone who has registered since is skipped, as their attendee mail covers
 * it. `key` names the moment, so a retry never mails a lead twice.
 *
 * Never throws; returns how many emails went out.
 */
export async function emailInterestLeads(
  prisma: PrismaService,
  email: EmailService,
  eventId: string,
  key: string,
  changes?: Change[],
): Promise<number> {
  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true, slug: true, title: true, type: true, timezone: true,
        startDateTime: true, endDateTime: true, venueName: true, city: true,
      },
    });
    if (!event) return 0;
    const base = {
      eventId: event.id,
      eventSlug: event.slug,
      eventTitle: event.title,
      eventDate: formatEventDate(event.startDateTime, event.timezone),
      eventTime: formatEventTime(event.startDateTime, event.endDateTime, event.timezone),
      venueName: event.venueName || undefined,
      city: event.city || undefined,
      isOnline: event.type === 'ONLINE',
      changes,
    };

    let sent = 0;
    await forEachPage(
      (page) =>
        prisma.lead.findMany({
          ...page,
          where: {
            eventId,
            source: LeadSource.EVENT_INTEREST,
            status: { not: LeadStatus.ARCHIVED },
            email: { not: null },
          },
          select: { id: true, name: true, email: true },
        }),
      async (leads) => {
        const registered = await prisma.userIdentity.findMany({
          where: {
            email: { in: leads.map((l) => l.email!), mode: 'insensitive' },
            user: { registrations: { some: { eventId, ...COUNTS_AS_ATTENDING } } },
          },
          select: { email: true },
        });
        const skip = new Set(registered.map((r) => r.email!.toLowerCase()));
        await inChunks(
          leads.filter((l) => !skip.has(l.email!.toLowerCase())),
          async (l) => {
            const ok = await email.sendEventInterest(
              { ...base, email: l.email!, name: l.name ?? undefined },
              { dedupKey: `lead.interest:${key}:${l.id}`, kind: 'lead.interest' },
            );
            if (ok) sent++;
          },
        );
      },
    );
    return sent;
  } catch (err) {
    reportError(err, { job: 'lead.interest', eventId, key });
    return 0;
  }
}
