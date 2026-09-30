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
  kind: 'TEAM_ASSIGNED' | 'ROOM_ASSIGNED' | 'ROOM_CLEARED';
  teamCode?: string | null;
  teamName?: string | null;
  /** Room name for ROOM_ASSIGNED. */
  roomName?: string | null;
}
