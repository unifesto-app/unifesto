/**
 * Payload contracts for the notification event bus. Kept intentionally small —
 * handlers resolve their own recipients/copy from these ids so domain services
 * only have to emit primitives, never build push content.
 */

export interface RegistrationConfirmedEvent {
  userId: string;
  eventId: string;
  eventTitle: string;
  eventSlug?: string;
}

/** Cancellation / refund outcome for an attendee (push replaces WhatsApp here). */
export interface RegistrationUpdateEvent {
  userId: string;
  eventId: string;
  eventTitle: string;
  eventSlug?: string;
  kind: 'CANCELLED' | 'REFUND_APPROVED' | 'REFUND_DECLINED';
  /** Refund amount text, e.g. "₹499". */
  amount?: string;
}

export interface WaitlistOfferEvent {
  userId: string;
  eventId: string;
  eventTitle: string;
  eventSlug?: string;
  /** When the held seat offer expires, for the body copy. */
  expiresAt?: Date;
}

export interface NewEventEvent {
  eventId: string;
  eventTitle: string;
  eventSlug?: string;
  spaceId: string;
  /** Users to notify (space followers / members), resolved by the emitter. */
  recipientUserIds: string[];
}

/**
 * The health sampler opened or resolved an incident on its own, or found a
 * window where nothing was sampling. Pushed to every platform admin.
 */
export interface StatusIncidentEvent {
  incidentId: string;
  /** opened: service went down · resolved: it recovered · gap: retroactive outage. */
  kind: 'opened' | 'resolved' | 'gap';
  /** Service display name, e.g. "Database". */
  serviceName: string;
  impact: 'NONE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
  /** Why the check failed (opened only), e.g. "event loop lag 900ms". */
  reason?: string | null;
  /** Outage length (resolved / gap). */
  durationMin?: number;
}

export interface WhatsappInboundEvent {
  conversationId: string;
  /** Sender's WhatsApp profile name, else their +number. */
  senderName: string;
  /** Text body or a media label, for the push body. */
  preview: string;
}

/**
 * Something a hackathon/competition participant should hear about: their team
 * advanced or was eliminated in a round, the organiser revealed judges' written
 * feedback, or an award was declared for them. Never carries marks.
 */
export interface CompetitionUpdateEvent {
  /** Team members to notify, resolved by the leaderboard service. */
  userIds: string[];
  eventId: string;
  eventTitle: string;
  kind: 'ADVANCED' | 'ELIMINATED' | 'FEEDBACK' | 'AWARD';
  /** Round name for ADVANCED/ELIMINATED, award title for AWARD. */
  label?: string;
  entrantName?: string;
}

/**
 * A hackathon team update: the team was imported and given its Team ID, or it
 * was put in (or moved out of) a room. Always delivered as push + in-app.
 */
export interface HackathonUpdateEvent {
  /** Team members to notify, resolved by the hackathon service. */
  userIds: string[];
  eventId: string;
  eventTitle: string;
  kind:
    | 'TEAM_ASSIGNED'
    | 'ROOM_ASSIGNED'
    | 'ROOM_CLEARED'
    // Problem statements (Phase 2): teams can now choose; a teammate locked
    // one in; the curator assigned/changed one; the curator reopened it; the
    // deadline is an hour away.
    | 'STATEMENTS_OPEN'
    | 'STATEMENT_LOCKED'
    | 'STATEMENT_ASSIGNED'
    | 'STATEMENT_UNLOCKED'
    | 'STATEMENT_DEADLINE'
    // Rounds and the evaluation queue (Phase 3): a round the team is in
    // opened / closed; it's next in line; it's been called ("You're up");
    // it missed its call; the organisers took it out of a queue or moved it
    // to another judge.
    | 'ROUND_OPENED'
    | 'ROUND_CLOSED'
    | 'QUEUE_NEXT'
    | 'QUEUE_CALLED'
    | 'QUEUE_NO_SHOW'
    | 'QUEUE_REMOVED'
    | 'QUEUE_MOVED'
    // Results (Phase 4): this team won an award; winners were announced.
    | 'WON'
    | 'WINNERS_ANNOUNCED';
  teamCode?: string | null;
  teamName?: string | null;
  /** Room name for ROOM_ASSIGNED. */
  roomName?: string | null;
  /** Statement title for STATEMENT_LOCKED / STATEMENT_ASSIGNED. */
  statementTitle?: string | null;
  /** Round name for ROUND_* and QUEUE_* kinds. */
  roundName?: string | null;
  /** The judge or panel, for QUEUE_* kinds. */
  evaluatorName?: string | null;
  /** Where to go when called (a room / table), for QUEUE_CALLED. */
  location?: string | null;
  /** Online judging: the call to join, for QUEUE_CALLED. */
  meetingUrl?: string | null;
  /** The award's title, for WON. */
  awardTitle?: string | null;
}

/**
 * A hackathon update for a judge: they were added, a round they judge opened
 * or closed, a team joined their queue while they were free, their slot ran
 * out, or the organisers reopened marks they'd submitted. Push + in-app.
 */
export interface HackathonJudgeUpdateEvent {
  userIds: string[];
  eventId: string;
  eventTitle: string;
  kind:
    | 'JUDGE_ADDED'
    | 'MENTOR_ADDED'
    | 'ROUND_OPENED'
    | 'ROUND_CLOSED'
    | 'QUEUE_JOINED'
    | 'TIME_UP'
    | 'MARKS_REOPENED'
    | 'WINNERS_ANNOUNCED';
  teamCode?: string | null;
  teamName?: string | null;
  roundName?: string | null;
}

/**
 * A curator announcement to a hackathon's teams, judges or one room. The
 * recipients are resolved by the hackathon service. Push + in-app.
 */
export interface HackathonAnnouncementEvent {
  userIds: string[];
  eventId: string;
  eventTitle: string;
  title: string;
  body: string;
}

/**
 * A hackathon help-desk query: raised (to its POCs, room volunteers or
 * curators), or picked up / resolved (to the team). Copy and link are built by
 * the hackathon service. Push + in-app.
 */
export interface HackathonHelpDeskEvent {
  userIds: string[];
  eventId: string;
  title: string;
  body: string;
  deepLink: string;
}
