import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { NotificationEvents } from '../notifications.constants';
import type {
  RegistrationConfirmedEvent,
  WaitlistOfferEvent,
  NewEventEvent,
  WhatsappInboundEvent,
  StatusIncidentEvent,
  CompetitionUpdateEvent,
  HackathonUpdateEvent,
} from '../notifications.events';

/**
 * Push copy for a competition update. Elimination is the sensitive one: it
 * lands on a lock screen, often mid-event, so it names the round and points at
 * what's still worth opening (feedback, winners) rather than just "you're out".
 */
export function competitionPushCopy(e: CompetitionUpdateEvent): { title: string; body: string } {
  const team = e.entrantName ? `${e.entrantName}` : 'Your team';
  switch (e.kind) {
    case 'ADVANCED':
      return { title: `${team} made it through`, body: `You're into ${e.label ?? 'the next round'} at ${e.eventTitle}.` };
    case 'ELIMINATED':
      return {
        title: `${e.eventTitle}: ${e.label ?? 'round'} results`,
        body: `${team} didn't advance this time. Thanks for competing. Results and winners are in the app.`,
      };
    case 'FEEDBACK':
      return { title: 'Judges\' feedback is in', body: `Read what the panel said about ${e.entrantName ?? 'your team'} at ${e.eventTitle}.` };
    case 'AWARD':
      return { title: `${team} won ${e.label ?? 'an award'}!`, body: `Congratulations from ${e.eventTitle}.` };
  }
}

/** Push + in-app copy for a hackathon team update. */
export function hackathonPushCopy(e: HackathonUpdateEvent): { title: string; body: string } {
  const team = e.teamName || 'Your team';
  switch (e.kind) {
    case 'TEAM_ASSIGNED':
      return {
        title: `You're in ${e.eventTitle}`,
        body: `${team} is registered${e.teamCode ? ` as ${e.teamCode}` : ''}. Open the app for your venue and next steps.`,
      };
    case 'ROOM_ASSIGNED':
      return {
        title: `${team}: your room is ${e.roomName ?? 'ready'}`,
        body: `Head to ${e.roomName ?? 'your room'} for ${e.eventTitle}. Details are in the app.`,
      };
    case 'ROOM_CLEARED':
      return {
        title: `${team}: room update`,
        body: `Your room at ${e.eventTitle} changed. The organisers will assign a new one.`,
      };
  }
}

/**
 * Simple transactional pushes: emit a domain event, map it to a category, send.
 */
@Injectable()
export class TransactionalNotificationHandler {
  private readonly logger = new Logger(TransactionalNotificationHandler.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(NotificationEvents.RegistrationConfirmed, { async: true })
  async onRegistrationConfirmed(e: RegistrationConfirmedEvent): Promise<void> {
    await this.notifications.send([e.userId], {
      category: 'registrationUpdates',
      title: "You're in!",
      body: `Your spot for ${e.eventTitle} is confirmed.`,
      deepLink: `unifesto://event/${e.eventSlug || e.eventId}`,
      data: { type: 'registration', eventId: e.eventId },
    });
  }

  @OnEvent(NotificationEvents.WaitlistOffer, { async: true })
  async onWaitlistOffer(e: WaitlistOfferEvent): Promise<void> {
    const expiryNote = e.expiresAt
      ? ` Claim it before ${e.expiresAt.toLocaleString('en-IN')}.`
      : ' Claim it before it expires.';
    await this.notifications.send([e.userId], {
      category: 'registrationUpdates',
      title: `A spot opened up for ${e.eventTitle}`,
      body: `You're off the waitlist.${expiryNote}`,
      deepLink: `unifesto://event/${e.eventSlug || e.eventId}`,
      data: { type: 'waitlist_offer', eventId: e.eventId },
    });
  }

  @OnEvent(NotificationEvents.NewEvent, { async: true })
  async onNewEvent(e: NewEventEvent): Promise<void> {
    if (!e.recipientUserIds?.length) return;
    await this.notifications.send(e.recipientUserIds, {
      category: 'newEvents',
      title: 'New event',
      body: `${e.eventTitle} just went live.`,
      deepLink: `unifesto://event/${e.eventSlug || e.eventId}`,
      data: { type: 'new_event', eventId: e.eventId, spaceId: e.spaceId },
    });
  }

  /**
   * A message landed in the Business-number inbox: ping every platform admin so
   * they can answer inside Meta's 24h reply window. Opens the thread in the
   * mobile Apex tab.
   */
  @OnEvent(NotificationEvents.WhatsappInbound, { async: true })
  async onWhatsappInbound(e: WhatsappInboundEvent): Promise<void> {
    const admins = await this.prisma.userRole.findMany({
      where: { role: { code: RoleCode.ADMIN }, spaceId: null, eventId: null },
      select: { userId: true },
    });
    if (!admins.length) return;
    const body = e.preview.length > 140 ? `${e.preview.slice(0, 137)}...` : e.preview;
    await this.notifications.send(
      admins.map((a) => a.userId),
      {
        category: 'adminAlerts',
        title: `WhatsApp · ${e.senderName}`,
        body: body || 'New message',
        deepLink: `unifesto://apex/whatsapp/${e.conversationId}`,
        data: { type: 'whatsapp_inbound', conversationId: e.conversationId },
      },
    );
  }

  /**
   * Auto-detected outage opened / recovered, or a sampling gap found after the
   * fact: ping every platform admin. Opens the status board in the mobile Apex tab.
   */
  @OnEvent(NotificationEvents.StatusIncident, { async: true })
  async onStatusIncident(e: StatusIncidentEvent): Promise<void> {
    const admins = await this.prisma.userRole.findMany({
      where: { role: { code: RoleCode.ADMIN }, spaceId: null, eventId: null },
      select: { userId: true },
    });
    if (!admins.length) return;
    await this.notifications.send(
      admins.map((a) => a.userId),
      {
        category: 'adminAlerts',
        ...statusIncidentPushCopy(e),
        deepLink: 'unifesto://apex/status',
        data: { type: 'status_incident', kind: e.kind, incidentId: e.incidentId },
      },
    );
  }

  /** Round decisions, feedback reveal and awards for a competition's teams. */
  @OnEvent(NotificationEvents.CompetitionUpdate, { async: true })
  async onCompetitionUpdate(e: CompetitionUpdateEvent): Promise<void> {
    if (!e.userIds?.length) return;
    await this.notifications.send(e.userIds, {
      category: 'registrationUpdates',
      ...competitionPushCopy(e),
      deepLink: `unifesto://competition/${e.eventId}`,
      data: { type: 'competition', kind: e.kind, eventId: e.eventId },
      inbox: { type: 'competition', eventId: e.eventId },
    });
  }

  /** Hackathon team updates: always push + in-app, opening the team's hub. */
  @OnEvent(NotificationEvents.HackathonUpdate, { async: true })
  async onHackathonUpdate(e: HackathonUpdateEvent): Promise<void> {
    if (!e.userIds?.length) return;
    await this.notifications.send(e.userIds, {
      category: 'registrationUpdates',
      ...hackathonPushCopy(e),
      deepLink: `unifesto://hackathon/${e.eventId}`,
      data: { type: 'hackathon', kind: e.kind, eventId: e.eventId },
      inbox: { type: 'hackathon', eventId: e.eventId },
    });
  }
}

const IMPACT_WORD: Record<StatusIncidentEvent['impact'], string> = {
  NONE: 'Maintenance',
  MINOR: 'Minor',
  MAJOR: 'Major',
  CRITICAL: 'Critical',
};

function statusIncidentPushCopy(e: StatusIncidentEvent): { title: string; body: string } {
  const took = e.durationMin != null ? `${e.durationMin} min` : null;
  switch (e.kind) {
    case 'opened':
      return {
        title: `${e.serviceName} is down`,
        body: `${IMPACT_WORD[e.impact]} incident opened automatically.${e.reason ? ` Cause: ${e.reason}.` : ''}`,
      };
    case 'resolved':
      return {
        title: `${e.serviceName} recovered`,
        body: took ? `Back up after ${took}. Incident resolved.` : 'Back up. Incident resolved.',
      };
    default:
      return {
        title: 'Backend was unreachable',
        body: `No health checks for ${took ?? 'a while'}. Logged as a past incident.`,
      };
  }
}
