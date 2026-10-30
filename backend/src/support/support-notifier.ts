import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '../common/on-event';
import { RoleCode, SupportDesk, SupportTicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { SPACE_APP } from '../email/layout';
import { SUPPORT_CASE_EVENT, type SupportCaseEvent, SupportService } from './support.service';

const PREVIEW_CHARS = 140;
const preview = (text: string) => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 3)}...` : text);

/** What the requester is told, or null when this event isn't theirs to hear. */
export function requesterHeadline(e: SupportCaseEvent, status: SupportTicketStatus): string | null {
  switch (e.kind) {
    case 'REPLIED':
      return 'New reply to your request';
    case 'STATUS':
      if (status === SupportTicketStatus.RESOLVED) return 'Your request was resolved';
      if (status === SupportTicketStatus.CLOSED) return 'Your request was closed';
      return null;
    case 'ESCALATED':
      return 'Unifesto is now helping with your request';
    case 'SENT_TO_SPACE':
      return 'The organiser is now helping with your request';
    default:
      return null;
  }
}

/** What the desk is told about case #n. */
export function deskHeadline(e: SupportCaseEvent, n: number): string {
  switch (e.kind) {
    case 'CREATED':
      return `New request #${n}`;
    case 'REPLIED':
      return `New reply on #${n}`;
    case 'STATUS':
      return `#${n} was reopened`;
    case 'ESCALATED':
      return `#${n} was escalated to Unifesto`;
    case 'SENT_TO_SPACE':
      return `Unifesto passed #${n} to you`;
  }
}

/**
 * D3: tells the other side of an Assist case, off the request path.
 * Requester: push + in-app + email. Space desk: push + in-app + email.
 * Platform desk: staff push only (Apex is their inbox).
 */
@Injectable()
export class SupportNotifier {
  private readonly logger = new Logger(SupportNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly support: SupportService,
  ) {}

  @OnEvent(SUPPORT_CASE_EVENT, { async: true })
  async onCase(e: SupportCaseEvent): Promise<void> {
    try {
      const t = await this.prisma.supportTicket.findUnique({
        where: { id: e.ticketId },
        select: {
          id: true,
          ticketNumber: true,
          subject: true,
          status: true,
          desk: true,
          requesterId: true,
          contactEmail: true,
          spaceId: true,
          eventId: true,
          escalatedAt: true,
          assignedToId: true,
          requester: { select: { fullName: true, identities: { select: { email: true }, take: 1 } } },
        },
      });
      if (!t) return;
      const body = e.message ? preview(e.message) : t.subject;

      if (e.to === 'REQUESTER') {
        const headline = requesterHeadline(e, t.status);
        if (!headline || t.requesterId === e.actorId) return;
        await this.notifications.send([t.requesterId], {
          category: 'support',
          title: headline,
          body,
          deepLink: `unifesto://manage/support/${t.id}`,
          data: { type: 'support', ticketId: t.id, eventId: t.eventId },
        });
        const to = t.contactEmail ?? t.requester.identities[0]?.email;
        if (to) {
          // An operator's own "contact Unifesto" case lives in the Space app.
          const operatorCase = t.desk === SupportDesk.PLATFORM && !!t.spaceId && !t.eventId && !t.escalatedAt;
          await this.email.sendSupportCaseUpdate({
            email: to,
            name: t.requester.fullName,
            ticketNumber: t.ticketNumber,
            subject: t.subject,
            headline,
            message: e.message,
            cta: operatorCase ? { label: 'Open in Space', url: `${SPACE_APP}/support` } : null,
          });
        }
        return;
      }

      const headline = deskHeadline(e, t.ticketNumber);
      if (t.desk === SupportDesk.PLATFORM) {
        const ids = t.assignedToId
          ? [t.assignedToId]
          : (
              await this.prisma.userRole.findMany({
                where: { role: { code: RoleCode.ADMIN }, spaceId: null, eventId: null },
                select: { userId: true },
              })
            ).map((r) => r.userId);
        await this.notifications.send(
          ids.filter((id) => id !== e.actorId),
          {
            category: 'adminAlerts',
            title: headline,
            body,
            deepLink: `unifesto://apex/support/${t.id}`,
            data: { type: 'support', ticketId: t.id },
          },
        );
        return;
      }

      const ids = (await this.support.spaceDeskMemberIds(t)).filter((id) => id !== e.actorId);
      if (!ids.length) return;
      await this.notifications.send(ids, {
        category: 'support',
        title: headline,
        body,
        deepLink: `unifesto://manage/support/${t.id}`,
        data: { type: 'support', ticketId: t.id, eventId: t.eventId },
      });
      // ponytail: no Space inbox until D9, so the mail carries the message and points at the app.
      const members = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { fullName: true, identities: { select: { email: true }, take: 1 } },
      });
      for (const m of members) {
        const to = m.identities[0]?.email;
        if (!to) continue;
        await this.email.sendSupportCaseUpdate({
          email: to,
          name: m.fullName,
          ticketNumber: t.ticketNumber,
          subject: t.subject,
          headline,
          message: e.message,
        });
      }
    } catch (err: any) {
      // Never surfaces: the case change already happened.
      this.logger.warn(`Assist notification failed for ${e.ticketId}: ${err?.message ?? err}`);
    }
  }
}
