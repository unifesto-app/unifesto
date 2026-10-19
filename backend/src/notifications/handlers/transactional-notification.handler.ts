import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RoleCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications.service';
import { NotificationEvents } from '../notifications.constants';
import type {
  RegistrationConfirmedEvent,
  RegistrationUpdateEvent,
  WaitlistOfferEvent,
  NewEventEvent,
  WhatsappInboundEvent,
  StatusIncidentEvent,
  CompetitionUpdateEvent,
  HackathonUpdateEvent,
  HackathonJudgeUpdateEvent,
  HackathonAnnouncementEvent,
  HackathonHelpDeskEvent,
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
    case 'STATEMENTS_OPEN':
      return {
        title: `${e.eventTitle}: problem statements are open`,
        body: `Lock in ${e.teamName ? `${e.teamName}'s` : "your team's"} problem statement in the app to unlock the hackathon.`,
      };
    case 'STATEMENT_LOCKED':
      return {
        title: `${team} locked in its problem statement`,
        body: `${e.statementTitle ? `"${e.statementTitle}". ` : ''}The hackathon is open for your team.`,
      };
    case 'STATEMENT_ASSIGNED':
      return {
        title: `${team}: your problem statement`,
        body: `The organisers set it${e.statementTitle ? ` to "${e.statementTitle}"` : ''}. Details are in the app.`,
      };
    case 'STATEMENT_UNLOCKED':
      return {
        title: `${team}: choose your problem statement again`,
        body: `The organisers reopened it for your team at ${e.eventTitle}.`,
      };
    case 'STATEMENT_DEADLINE':
      return {
        title: `${team}: 1 hour left to choose`,
        body: `Lock in your problem statement for ${e.eventTitle} before the deadline, or the organisers will assign one.`,
      };
    case 'ROUND_OPENED':
      return {
        title: `${e.roundName ?? 'A round'} is open`,
        body: `Pick a judge and join the queue for ${e.eventTitle} in the app.`,
      };
    case 'ROUND_CLOSED':
      return {
        title: `${e.roundName ?? 'The round'} has closed`,
        body: `Evaluations for ${e.roundName ?? 'this round'} at ${e.eventTitle} are over. Results come later.`,
      };
    case 'QUEUE_NEXT':
      return {
        title: `${team}: you're next`,
        body: `${e.evaluatorName ?? 'Your judge'} calls you next. Get ready${e.location ? ` near ${e.location}` : ''}.`,
      };
    case 'QUEUE_CALLED':
      return {
        title: `${team}: you're up!`,
        body: e.meetingUrl
          ? `${e.evaluatorName ?? 'Your judge'} is ready. Join the call from the app now.`
          : `Go to ${e.evaluatorName ?? 'your judge'}${e.location ? ` at ${e.location}` : ''} now.`,
      };
    case 'QUEUE_NO_SHOW':
      return {
        title: `${team}: you missed your call`,
        body: `${e.evaluatorName ?? 'The judge'} moved on. You can join a queue again from the app.`,
      };
    case 'QUEUE_REMOVED':
      return {
        title: `${team}: queue update`,
        body: `The organisers took your team out of ${e.evaluatorName ? `${e.evaluatorName}'s` : 'the'} queue. You can join again from the app.`,
      };
    case 'QUEUE_MOVED':
      return {
        title: `${team}: new judge`,
        body: `The organisers moved your team to ${e.evaluatorName ?? 'another judge'}'s queue. You keep your place.`,
      };
    case 'WON':
      return {
        title: `${team} won ${e.awardTitle ?? 'an award'}!`,
        body: `Congratulations from ${e.eventTitle}. See the winners in the app.`,
      };
    case 'WINNERS_ANNOUNCED':
      return {
        title: `${e.eventTitle}: winners announced`,
        body: 'See who won, and your team\'s results, in the app. Thanks for taking part!',
      };
  }
}

/** Statement updates open the statement screen, round and queue ones the evaluate screen, the rest the hub. */
export function hackathonDeepLink(e: HackathonUpdateEvent): string {
  if (e.kind.startsWith('STATEMENT')) return `unifesto://hackathon/${e.eventId}/statement`;
  if (e.kind.startsWith('QUEUE') || e.kind === 'ROUND_OPENED') return `unifesto://hackathon/${e.eventId}/evaluate`;
  if (e.kind === 'WON' || e.kind === 'WINNERS_ANNOUNCED') return `unifesto://hackathon/${e.eventId}/results`;
  return `unifesto://hackathon/${e.eventId}`;
}

/** Push + in-app copy for a judge. */
export function hackathonJudgePushCopy(e: HackathonJudgeUpdateEvent): { title: string; body: string } {
  const team = [e.teamCode, e.teamName].filter(Boolean).join(' · ') || 'A team';
  switch (e.kind) {
    case 'JUDGE_ADDED':
      return { title: `You're judging ${e.eventTitle}`, body: 'Your judge console is in the app, under Judging.' };
    case 'MENTOR_ADDED':
      return { title: `You're mentoring at ${e.eventTitle}`, body: 'Your mentor console is in the app, under Judging.' };
    case 'ROUND_OPENED':
      return { title: `${e.roundName ?? 'A round'} is open`, body: `Teams at ${e.eventTitle} can join your queue now.` };
    case 'ROUND_CLOSED':
      return { title: `${e.roundName ?? 'The round'} has closed`, body: `Judging for ${e.roundName ?? 'this round'} at ${e.eventTitle} is over.` };
    case 'QUEUE_JOINED':
      return { title: `${team} joined your queue`, body: 'Call them from your judge console when you’re ready.' };
    case 'TIME_UP':
      return { title: `Time's up: ${team}`, body: 'Submit your marks or feedback to call the next team.' };
    case 'MARKS_REOPENED':
      return { title: `Your marks for ${team} are open again`, body: 'The organisers reopened them for 5 minutes.' };
    case 'WINNERS_ANNOUNCED':
      return { title: `${e.eventTitle}: winners announced`, body: 'Thanks for judging! See the winners in the app.' };
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

  @OnEvent(NotificationEvents.RegistrationUpdate, { async: true })
  async onRegistrationUpdate(e: RegistrationUpdateEvent): Promise<void> {
    const copy = {
      CANCELLED: { title: 'Registration cancelled', body: `Your registration for ${e.eventTitle} was cancelled.` },
      REFUND_APPROVED: { title: 'Refund approved', body: `Your refund${e.amount ? ` of ${e.amount}` : ''} for ${e.eventTitle} has been approved.` },
      REFUND_DECLINED: { title: 'Refund request declined', body: `Your refund request for ${e.eventTitle} wasn't approved.` },
    }[e.kind];
    await this.notifications.send([e.userId], {
      category: 'registrationUpdates',
      ...copy,
      deepLink: `unifesto://event/${e.eventSlug || e.eventId}`,
      data: { type: 'registration_update', eventId: e.eventId },
    });
  }

  @OnEvent(NotificationEvents.WaitlistOffer, { async: true })
  async onWaitlistOffer(e: WaitlistOfferEvent): Promise<void> {
    const expiryNote = e.expiresAt
      ? ` Claim it before ${e.expiresAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`
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
      deepLink: hackathonDeepLink(e),
      data: { type: 'hackathon', kind: e.kind, eventId: e.eventId },
      inbox: { type: 'hackathon', eventId: e.eventId },
    });
  }

  /** Curator announcements: push + in-app, opening the hackathon updates feed. */
  @OnEvent(NotificationEvents.HackathonAnnouncement, { async: true })
  async onHackathonAnnouncement(e: HackathonAnnouncementEvent): Promise<void> {
    if (!e.userIds?.length) return;
    await this.notifications.send(e.userIds, {
      category: 'registrationUpdates',
      title: `${e.eventTitle}: ${e.title}`,
      body: e.body,
      deepLink: `unifesto://hackathon/${e.eventId}/updates`,
      data: { type: 'hackathon', kind: 'ANNOUNCEMENT', eventId: e.eventId },
      inbox: { type: 'hackathon', eventId: e.eventId },
    });
  }

  /** Help-desk queries: push + in-app, opening the inbox (staff) or the team's help screen. */
  @OnEvent(NotificationEvents.HackathonHelpDesk, { async: true })
  async onHackathonHelpDesk(e: HackathonHelpDeskEvent): Promise<void> {
    if (!e.userIds?.length) return;
    await this.notifications.send(e.userIds, {
      category: 'registrationUpdates',
      title: e.title,
      body: e.body,
      deepLink: e.deepLink,
      data: { type: 'hackathon', kind: 'HELP', eventId: e.eventId },
      // New queries for event staff get their own type (the inbox's Staff tab);
      // the reply to the team stays a personal hackathon update.
      inbox: { type: e.toStaff ? 'help_desk' : 'hackathon', eventId: e.eventId },
    });
  }

  /** Judge updates: push + in-app, opening the judge console. */
  @OnEvent(NotificationEvents.HackathonJudgeUpdate, { async: true })
  async onHackathonJudgeUpdate(e: HackathonJudgeUpdateEvent): Promise<void> {
    if (!e.userIds?.length) return;
    await this.notifications.send(e.userIds, {
      category: 'registrationUpdates',
      ...hackathonJudgePushCopy(e),
      deepLink: e.kind === 'WINNERS_ANNOUNCED' ? `unifesto://hackathon/${e.eventId}/results` : `unifesto://judging/${e.eventId}`,
      data: { type: 'hackathon', audience: 'judge', kind: e.kind, eventId: e.eventId },
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
