/**
 * Hackathon mode API client (docs/hackathon-mobile-plan.md).
 *
 * Curator routes live under `/events/:eventId/hackathon` (event:manage-leaderboard,
 * re-checked server-side); the team's own routes under `/hackathon/:eventId`.
 * No marks ever travel on the team path — the server never sends them.
 */

import { call, type Result } from './manageEvent';
import { makeAuthenticatedRequest } from './helpers';

export type TeamStage = 'CANCELLED' | 'NEEDS_PS' | 'ACTIVE' | 'ELIMINATED';
export type TeamNameSource = 'FORM' | 'LEAD' | 'CURATOR' | 'DEFAULT';
/** How teams get a problem statement; null = not open yet. */
export type PsMode = 'TEAM_WRITES' | 'TEAM_PICKS' | 'CURATOR_ASSIGNS';
/** Themes from the curator's list, or short free text. */
export type ThemeMode = 'LIST' | 'TEXT';
/** Why a team can't lock in a statement itself right now (null = it can). */
export type StatementBlock = 'LOCKED' | 'NOT_OPEN' | 'CURATOR_ASSIGNS' | 'DEADLINE_PASSED';

/** Who locked a statement in: a named team member, or the organisers. */
export interface StatementSetBy {
  kind: 'TEAM' | 'ORGANISER';
  name: string | null;
}

export interface Venue {
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapUrl?: string | null;
  notes?: string | null;
}

// ── Curator ──────────────────────────────────────────────────────────────────

export interface HackathonOverview {
  eventId: string;
  eventTitle: string;
  /** False when the space's plan doesn't include hackathons. */
  planAllowed: boolean;
  /** Curator / Space Admin: may declare and publish winners (Co-Curators can't). */
  canDeclareWinners: boolean;
  /** A leaderboard that isn't a hackathon; blocks switching on only if it has entrants. */
  otherBoard: { entrants: number } | null;
  /** Null until hackathon mode has been switched on once. */
  hackathon: {
    enabled: boolean;
    teamCodePrefix: string | null;
    teamCodeDigits: number;
    teamCodeNext: number;
    nextTeamCode: string | null;
    teamNameFieldId: string | null;
    psMode: PsMode | null;
    themeMode: ThemeMode;
    psDeadline: string | null;
    scoringMode: ScoringMode;
    /** Teams see the judges' written notes about their own team. */
    revealReviews: boolean;
    venue: Venue;
  } | null;
  eventVenue: Venue;
  counts: {
    teams: number;
    active: number;
    cancelled: number;
    unallocated: number;
    rooms: number;
    /** Non-cancelled teams with a locked problem statement. */
    psLocked: number;
    statements: number;
    themes: number;
    awards: number;
    awardsPublished: number;
  };
  teamNameFields: { id: string; label: string; ticketTypeName: string | null }[];
  groupTicketTypes: { id: string; name: string; isActive: boolean }[];
}

export interface HackathonConfigInput {
  teamCodePrefix?: string | null;
  teamCodeDigits?: number;
  teamCodeNext?: number;
  teamNameFieldId?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueMapUrl?: string | null;
  venueNotes?: string | null;
  psMode?: PsMode | null;
  themeMode?: ThemeMode;
  /** ISO time; null clears the deadline. */
  psDeadline?: string | null;
  scoringMode?: ScoringMode;
  revealReviews?: boolean;
}

export interface TeamRow {
  id: string;
  teamCode: string | null;
  name: string;
  nameSource: TeamNameSource | null;
  stage: TeamStage;
  cancelledAt: string | null;
  room: { id: string; name: string } | null;
  registrationId: string | null;
  leadName: string | null;
  groupSize: number | null;
  /** People with an app account on the team (the lead included). */
  joinedCount: number;
  statement: {
    code: string | null;
    title: string;
    themeLabel: string | null;
    locked: boolean;
    /** The curator changed it after the team was evaluated. */
    changedAfterEval: boolean;
  } | null;
}

/** A team's problem statement in full, as the curator sees it. */
export interface TeamStatement {
  /** LIST = one from the curator's list; OWN = written by the team (or for it). */
  source: 'LIST' | 'OWN';
  statementId: string | null;
  code: string | null;
  title: string;
  description: string;
  theme: { id: string; name: string } | null;
  themeText: string | null;
  themeLabel: string | null;
  lockedAt: string | null;
  changedAfterEvalAt: string | null;
  setBy: StatementSetBy | null;
}

export interface TeamMember {
  seat: number;
  name: string | null;
  isLead: boolean;
  /** Has an app account on this seat, so they can open the hackathon. */
  joined: boolean;
  isMe?: boolean;
}

export interface TeamDetail {
  id: string;
  teamCode: string | null;
  name: string;
  nameSource: TeamNameSource | null;
  stage: TeamStage;
  cancelledAt: string | null;
  room: { id: string; name: string; location: string | null; notes: string | null } | null;
  registrationId: string | null;
  members: TeamMember[];
  statement: TeamStatement | null;
}

export interface ImportResult {
  imported: number;
  alreadyImported: number;
  individualSkipped: number;
  nextTeamCode: string;
}

export interface Room {
  id: string;
  name: string;
  location: string | null;
  capacity: number;
  notes: string | null;
  order: number;
  occupied: number;
  teams: { id: string; teamCode: string | null; name: string }[];
  volunteers: StaffUser[];
}

export interface RoomInput {
  name: string;
  location?: string | null;
  capacity: number;
  notes?: string | null;
  volunteerUserIds?: string[];
}

/** Someone on the event team: who can be a room volunteer or a help-topic POC. */
export interface StaffUser {
  id: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  roleCode: string | null;
}

const base = (eventId: string) => `/events/${eventId}/hackathon`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const getHackathonOverview = (eventId: string) => call<HackathonOverview>(base(eventId));
export const enableHackathon = (eventId: string) => call<HackathonOverview>(`${base(eventId)}/enable`, json('POST'));
export const disableHackathon = (eventId: string) => call<HackathonOverview>(`${base(eventId)}/disable`, json('POST'));
export const updateHackathonConfig = (eventId: string, input: HackathonConfigInput) =>
  call<HackathonOverview>(`${base(eventId)}/config`, json('PATCH', input));

export const importTeams = (eventId: string, ticketTypeIds?: string[]) =>
  call<ImportResult>(`${base(eventId)}/teams/import`, json('POST', ticketTypeIds?.length ? { ticketTypeIds } : {}));
export const getTeams = (eventId: string) => call<TeamRow[]>(`${base(eventId)}/teams`);
export const getTeam = (eventId: string, teamId: string) => call<TeamDetail>(`${base(eventId)}/teams/${teamId}`);
export const updateTeam = (
  eventId: string,
  teamId: string,
  input: { teamCode?: string; name?: string; roomId?: string | null },
) => call<TeamDetail>(`${base(eventId)}/teams/${teamId}`, json('PATCH', input));

export const getRooms = (eventId: string) =>
  call<{ unallocated: number; staff: StaffUser[]; rooms: Room[] }>(`${base(eventId)}/rooms`);
export const createRoom = (eventId: string, input: RoomInput) => call<Room>(`${base(eventId)}/rooms`, json('POST', input));
export const updateRoom = (eventId: string, roomId: string, input: Partial<RoomInput>) =>
  call<Room>(`${base(eventId)}/rooms/${roomId}`, json('PATCH', input));
export const deleteRoom = (eventId: string, roomId: string) =>
  call<{ ok: true }>(`${base(eventId)}/rooms/${roomId}`, json('DELETE'));
export const autoAllocateRooms = (eventId: string) =>
  call<{ allocated: number; unplaced: number; unallocated: number; rooms: Room[] }>(
    `${base(eventId)}/rooms/auto-allocate`,
    json('POST'),
  );

// ── Curator: problem statements & themes ─────────────────────────────────────

export interface Theme {
  id: string;
  name: string;
  order: number;
  /** Statements on the list with this theme. */
  statements: number;
  /** Active teams with this theme. */
  teams: number;
}

export interface Statement {
  id: string;
  code: string;
  title: string;
  description: string;
  theme: { id: string; name: string } | null;
  /** Null = no limit. */
  maxTeams: number | null;
  order: number;
  taken: number;
  placesLeft: number | null;
  teams: { id: string; teamCode: string | null; name: string; locked: boolean }[];
}

export interface StatementList {
  mode: PsMode | null;
  themeMode: ThemeMode;
  deadline: string | null;
  /** What a new statement is coded if left blank. */
  nextCode: string;
  /** Teams that wrote their own statement. */
  ownStatements: number;
  statements: Statement[];
}

export interface StatementInput {
  code?: string | null;
  title: string;
  description: string;
  themeId?: string | null;
  maxTeams?: number | null;
}

/** One from the list, or the team's own (title + description); plus a theme when needed. */
export interface SetStatementInput {
  statementId?: string;
  title?: string;
  description?: string;
  themeId?: string;
  themeText?: string;
}

export const getThemes = (eventId: string) => call<Theme[]>(`${base(eventId)}/themes`);
export const createTheme = (eventId: string, name: string) =>
  call<Theme>(`${base(eventId)}/themes`, json('POST', { name }));
export const updateTheme = (eventId: string, themeId: string, name: string) =>
  call<Theme>(`${base(eventId)}/themes/${themeId}`, json('PATCH', { name }));
export const deleteTheme = (eventId: string, themeId: string) =>
  call<{ ok: true }>(`${base(eventId)}/themes/${themeId}`, json('DELETE'));

export const getStatements = (eventId: string) => call<StatementList>(`${base(eventId)}/statements`);
export const createStatement = (eventId: string, input: StatementInput) =>
  call<Statement>(`${base(eventId)}/statements`, json('POST', input));
export const updateStatement = (eventId: string, statementId: string, input: Partial<StatementInput>) =>
  call<Statement>(`${base(eventId)}/statements/${statementId}`, json('PATCH', input));
export const deleteStatement = (eventId: string, statementId: string) =>
  call<{ ok: true }>(`${base(eventId)}/statements/${statementId}`, json('DELETE'));

/** Assign or change a team's statement (locks it for the team). */
export const assignTeamStatement = (eventId: string, teamId: string, input: SetStatementInput) =>
  call<TeamDetail>(`${base(eventId)}/teams/${teamId}/statement`, json('PUT', input));
/** Clear a team's statement so it can choose again. */
export const unlockTeamStatement = (eventId: string, teamId: string) =>
  call<TeamDetail>(`${base(eventId)}/teams/${teamId}/statement/unlock`, json('POST'));

// ── Team member ──────────────────────────────────────────────────────────────

export interface HackathonHub {
  eventId: string;
  event: { title: string; startDateTime: string; endDateTime: string; coverImageUrl: string | null };
  venue: Venue;
  /** Null when the signed-in user isn't on a team. */
  team: {
    id: string;
    teamCode: string | null;
    name: string;
    nameSource: TeamNameSource | null;
    stage: TeamStage;
    isLead: boolean;
    room: { name: string; location: string | null; notes: string | null } | null;
    members: TeamMember[];
    /** What the team chose or was assigned; null until then. */
    statement: {
      source: 'LIST' | 'OWN';
      code: string | null;
      title: string;
      description: string;
      themeLabel: string | null;
      lockedAt: string | null;
      setBy: StatementSetBy | null;
    } | null;
    /** Null when the team can lock one in now. Always null for a cancelled team. */
    statementBlock: StatementBlock | null;
    /** Open rounds and the team's place in a queue; null until it can be judged. */
    evaluation: {
      openRounds: number;
      request: { status: EvalStatus; position: number | null; roundName: string; evaluatorName: string | null } | null;
    } | null;
  } | null;
  problemStatements: { mode: PsMode | null; themeMode: ThemeMode; deadline: string | null };
  unreadCount: number;
}

/** The team's statement screen: what it can choose from, and whether this person may. */
export interface MyStatementOptions {
  mode: PsMode | null;
  themeMode: ThemeMode;
  deadline: string | null;
  cancelled: boolean;
  block: StatementBlock | null;
  /** Only the team lead locks the statement in. */
  isLead: boolean;
  themes: { id: string; name: string }[];
  /** The list, when teams pick from it. */
  statements: {
    id: string;
    code: string;
    title: string;
    description: string;
    theme: { id: string; name: string } | null;
    placesLeft: number | null;
  }[];
}

/** The team hub, or `data: null` when the event runs no hackathon (or it's off). */
export const getMyHackathon = (eventId: string) => call<HackathonHub | null>(`/hackathon/${eventId}/me`);
export const renameMyTeam = (eventId: string, name: string) =>
  call<{ name: string }>(`/hackathon/${eventId}/me/team-name`, json('PATCH', { name }));
export const getMyStatementOptions = (eventId: string) =>
  call<MyStatementOptions>(`/hackathon/${eventId}/statements`);
/** Lock in the team's statement (lead only, final). Returns the refreshed hub. */
export const lockMyStatement = (eventId: string, input: SetStatementInput) =>
  call<HackathonHub>(`/hackathon/${eventId}/me/statement`, json('POST', input));

// ── In-app notification feed ─────────────────────────────────────────────────

export interface InAppNotification {
  id: string;
  eventId: string | null;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

/** A slice of the feed: one event and/or one type, or everything but `excludeType`. */
export interface FeedScope {
  eventId?: string;
  type?: string;
  excludeType?: string;
}

/** Help-desk queries sent to event staff: the inbox's Staff tab. */
export const STAFF_NOTIFICATION_TYPE = 'help_desk';

const feedQuery = (scope: FeedScope & { before?: string; limit?: number }) => {
  const q = new URLSearchParams();
  if (scope.eventId) q.set('eventId', scope.eventId);
  if (scope.type) q.set('type', scope.type);
  if (scope.excludeType) q.set('excludeType', scope.excludeType);
  if (scope.limit) q.set('limit', String(scope.limit));
  if (scope.before) q.set('before', scope.before);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const getNotifications = (scope: FeedScope & { before?: string; limit?: number }) =>
  call<{ items: InAppNotification[]; nextBefore: string | null }>(`/users/me/notifications${feedQuery(scope)}`);
export const getUnreadNotificationCount = () => call<{ count: number }>('/users/me/notifications/unread-count');
export const markNotificationsRead = (scope: FeedScope & { ids?: string[] }): Promise<Result<{ updated: number }>> =>
  call<{ updated: number }>('/users/me/notifications/read', json('POST', scope));

// ── Judging: rounds, criteria, judges, panels, queues (Phase 3) ──────────────

export type RoundStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';
export type JudgingMode = 'SINGLE' | 'PANEL' | 'MULTI';
/** EVALUATION = judges give marks; MENTORING = mentors give feedback only. */
export type RoundKind = 'EVALUATION' | 'MENTORING';
export type PanelistRole = 'JUDGE' | 'MENTOR';
export type Standing = 'PENDING' | 'ADVANCED' | 'ELIMINATED';
export type EvalStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_PROGRESS'
  | 'AWAITING_MARKS'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'WITHDRAWN'
  | 'CANCELLED';

export interface RoundSettings {
  id: string;
  name: string;
  order: number;
  status: RoundStatus;
  kind: RoundKind;
  judgingMode: JudgingMode;
  /** MULTI: evaluations each team needs; MENTORING: sessions a team may have. */
  requiredEvaluations: number;
  slotMinutes: number;
  callGraceMinutes: number;
  eliminationEnabled: boolean;
  countsTowardTotal: boolean;
  /** After this, teams can't join a queue. */
  endAt: string | null;
  /** Teams can change project links until then (else until the round closes). */
  submissionsCloseAt: string | null;
}

export interface RoundRow extends RoundSettings {
  criteria: number;
  teams: number;
  evaluated: number;
  inQueue: number;
  undecided: number;
}

export interface Criterion {
  id: string;
  label: string;
  maxValue: number;
  weight: number;
  /** Set on the board for every round (older boards). */
  allRounds: boolean;
  /** Judges already gave marks against it. */
  marked: boolean;
}

export interface RoundDetail extends RoundSettings {
  criteria: Criterion[];
  teams: {
    id: string;
    teamCode: string | null;
    name: string;
    standing: Standing;
    evaluations: number;
    required: number;
    queueStatus: EvalStatus | null;
  }[];
  judges: number;
  panels: number;
  /** Undecided teams in earlier rounds, which block opening this one. */
  blockers: { roundId: string; roundName: string; teams: { id: string; teamCode: string | null; name: string }[] }[];
  openRequests: number;
}

export type RoundInput = Partial<Omit<RoundSettings, 'id' | 'order' | 'status'>>;

export const getRounds = (eventId: string) => call<RoundRow[]>(`${base(eventId)}/rounds`);
export const getRound = (eventId: string, roundId: string) => call<RoundDetail>(`${base(eventId)}/rounds/${roundId}`);
export const createRound = (eventId: string, input: RoundInput & { name: string }) =>
  call<RoundDetail>(`${base(eventId)}/rounds`, json('POST', input));
export const updateRound = (eventId: string, roundId: string, input: RoundInput) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}`, json('PATCH', input));
export const deleteRound = (eventId: string, roundId: string) =>
  call<{ ok: true }>(`${base(eventId)}/rounds/${roundId}`, json('DELETE'));
export const setRoundStatus = (eventId: string, roundId: string, status: RoundStatus) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/status`, json('POST', { status }));
export const setTeamDecision = (eventId: string, roundId: string, teamId: string, status: Standing) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/teams/${teamId}/decision`, json('PUT', { status }));
export const addCriterion = (eventId: string, roundId: string, input: { label: string; maxValue: number; weight?: number }) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/criteria`, json('POST', input));
export const updateCriterion = (
  eventId: string,
  roundId: string,
  metricId: string,
  input: { label: string; maxValue: number; weight?: number },
) => call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/criteria/${metricId}`, json('PATCH', input));
export const deleteCriterion = (eventId: string, roundId: string, metricId: string) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/criteria/${metricId}`, json('DELETE'));

export interface Judge {
  /** Profile id (used in routes). */
  id: string;
  userId: string;
  kind: PanelistRole;
  name: string | null;
  /** The email or phone number they were added with. */
  contact: string | null;
  /** Has opened the app at least once. */
  signedIn: boolean;
  themes: { id: string; name: string }[];
  location: string | null;
  meetingUrl: string | null;
  isAvailable: boolean;
  /** Null = every round. */
  rounds: { id: string; name: string }[] | null;
  panels: { id: string; name: string }[];
  queue: { waiting: number; busy: boolean };
}

export interface JudgeInput {
  themeIds?: string[];
  location?: string | null;
  meetingUrl?: string | null;
  /** Null or empty = every round. */
  roundIds?: string[] | null;
  isAvailable?: boolean;
}

export interface Panel {
  id: string;
  name: string;
  round: { id: string; name: string } | null;
  location: string | null;
  meetingUrl: string | null;
  isAvailable: boolean;
  members: { userId: string; name: string | null }[];
  queue: { waiting: number; busy: boolean };
}

export interface PanelInput {
  name?: string;
  roundId?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  memberUserIds?: string[];
  isAvailable?: boolean;
}

export const getJudges = (eventId: string) => call<Judge[]>(`${base(eventId)}/judges`);
export const getJudge = (eventId: string, judgeId: string) => call<Judge>(`${base(eventId)}/judges/${judgeId}`);
export const addJudge = (eventId: string, input: JudgeInput & { mobile?: string; email?: string; name?: string; kind?: PanelistRole }) =>
  call<Judge>(`${base(eventId)}/judges`, json('POST', input));
export const updateJudge = (eventId: string, judgeId: string, input: JudgeInput) =>
  call<Judge>(`${base(eventId)}/judges/${judgeId}`, json('PATCH', input));
export const removeJudge = (eventId: string, judgeId: string) =>
  call<{ ok: true }>(`${base(eventId)}/judges/${judgeId}`, json('DELETE'));

export const getPanels = (eventId: string) => call<Panel[]>(`${base(eventId)}/panels`);
export const createPanel = (eventId: string, input: PanelInput & { name: string }) =>
  call<Panel>(`${base(eventId)}/panels`, json('POST', input));
export const updatePanel = (eventId: string, panelId: string, input: PanelInput) =>
  call<Panel>(`${base(eventId)}/panels/${panelId}`, json('PATCH', input));
export const deletePanel = (eventId: string, panelId: string) =>
  call<{ ok: true }>(`${base(eventId)}/panels/${panelId}`, json('DELETE'));

/** A team in a queue list. */
export interface QueueTeam {
  id: string;
  teamCode: string | null;
  name: string;
  themeLabel: string | null;
}

export interface WaitingEntry {
  requestId: string;
  position: number;
  roundName: string | null;
  team: QueueTeam | null;
  requestedAt: string;
}

export interface MonitorQueue {
  kind: 'JUDGE' | 'PANEL';
  /** User id (judge) or panel id. */
  id: string;
  /** Judge profile id, to pause them; null for panels. */
  judgeId: string | null;
  /** JUDGE or MENTOR (panels are always judges). */
  role: PanelistRole;
  name: string;
  location: string | null;
  isAvailable: boolean;
  current: {
    requestId: string;
    status: EvalStatus;
    roundName: string | null;
    team: QueueTeam | null;
    calledAt: string | null;
    startedAt: string | null;
    slotEndsAt: string | null;
  } | null;
  waiting: WaitingEntry[];
}

export interface QueueMonitor {
  activeRounds: { id: string; name: string; judgingMode: JudgingMode }[];
  queues: MonitorQueue[];
  recent: {
    requestId: string;
    status: EvalStatus;
    roundName: string | null;
    roundActive: boolean;
    team: QueueTeam | null;
    closedAt: string | null;
    closedReason: string | null;
    judgments: { id: string; judgeName: string; submittedAt: string; editableUntil: string | null; locked: boolean }[];
  }[];
}

export const getQueues = (eventId: string) => call<QueueMonitor>(`${base(eventId)}/queues`);
export const removeFromQueue = (eventId: string, requestId: string) =>
  call<QueueMonitor>(`${base(eventId)}/queue/${requestId}/remove`, json('POST'));
export const reassignRequest = (eventId: string, requestId: string, to: { judgeUserId?: string; panelId?: string }) =>
  call<QueueMonitor>(`${base(eventId)}/queue/${requestId}/reassign`, json('POST', to));
export const forceComplete = (eventId: string, requestId: string) =>
  call<QueueMonitor>(`${base(eventId)}/queue/${requestId}/force-complete`, json('POST'));
export const reopenJudgment = (eventId: string, judgmentId: string) =>
  call<QueueMonitor>(`${base(eventId)}/judgments/${judgmentId}/reopen`, json('POST'));

// ── Judge console ────────────────────────────────────────────────────────────

export interface SlotStatement {
  source: 'LIST' | 'OWN';
  code: string | null;
  title: string;
  description: string;
  themeLabel: string | null;
}

export interface JudgeSlot {
  requestId: string;
  status: EvalStatus;
  round: { id: string; name: string; slotMinutes: number; callGraceMinutes: number } | null;
  team: {
    id: string;
    teamCode: string | null;
    name: string;
    /** Names only, never contacts. */
    members: string[];
    room: { name: string; location: string | null } | null;
    statement: SlotStatement | null;
    /** The team's project links for this round. */
    links: SubmissionLink[];
    linksNotes: string | null;
  } | null;
  calledAt: string | null;
  graceEndsAt: string | null;
  startedAt: string | null;
  slotEndsAt: string | null;
  myMarks: { submittedAt: string | null; editableUntil: string | null } | null;
  panelProgress: { total: number; submitted: number } | null;
}

export interface ConsoleQueue {
  kind: 'JUDGE' | 'PANEL';
  id: string;
  /** Panel name; null for the judge's own queue. */
  name: string | null;
  location: string | null;
  meetingUrl: string | null;
  isAvailable: boolean;
  current: JudgeSlot | null;
  waiting: WaitingEntry[];
  canCallNext: boolean;
}

export interface JudgeConsole {
  eventId: string;
  /** MENTOR gives written feedback only. */
  kind: PanelistRole;
  isAvailable: boolean;
  location: string | null;
  meetingUrl: string | null;
  rounds: { id: string; name: string; status: RoundStatus; kind: RoundKind; judgingMode: JudgingMode; slotMinutes: number; callGraceMinutes: number }[];
  /** A slot open somewhere, which keeps Call next off. */
  busy: { requestId: string; status: EvalStatus; teamCode: string | null } | null;
  queues: ConsoleQueue[];
  recent: {
    requestId: string;
    status: EvalStatus;
    roundId: string;
    roundName: string | null;
    team: QueueTeam | null;
    closedAt: string | null;
    submittedAt: string | null;
    editableUntil: string | null;
    locked: boolean;
  }[];
}

const judgeBase = (eventId: string) => `${base(eventId)}/judge`;
export const getJudgeConsole = (eventId: string) => call<JudgeConsole>(`${judgeBase(eventId)}/console`);
export const setJudgeAvailability = (eventId: string, isAvailable: boolean) =>
  call<JudgeConsole>(`${judgeBase(eventId)}/availability`, { ...json('PATCH', { isAvailable }), retry: true });
export const callNextTeam = (eventId: string, panelId?: string) =>
  call<JudgeConsole>(`${judgeBase(eventId)}/call-next`, json('POST', panelId ? { panelId } : {}));
export const startSlot = (eventId: string, requestId: string) =>
  call<JudgeConsole>(`${judgeBase(eventId)}/requests/${requestId}/start`, json('POST'));
export const markNoShow = (eventId: string, requestId: string) =>
  call<JudgeConsole>(`${judgeBase(eventId)}/requests/${requestId}/no-show`, json('POST'));

// ── Team: evaluation ─────────────────────────────────────────────────────────

export interface TeamRound {
  id: string;
  name: string;
  order: number;
  status: RoundStatus;
  kind: RoundKind;
  judgingMode: JudgingMode;
  slotMinutes: number;
  endAt: string | null;
  takesPart: boolean;
  standing: Standing;
  completed: number;
  required: number;
  canRequest: boolean;
  acceptingRequests: boolean;
}

export interface TeamRequest {
  id: string;
  roundId: string;
  roundName: string | null;
  status: EvalStatus;
  /** 1 = next. Null once called. */
  position: number | null;
  waitMinutes: number | null;
  evaluator: {
    kind: 'JUDGE' | 'PANEL';
    name: string;
    location: string | null;
    /** Only once the team is called. */
    meetingUrl: string | null;
    online: boolean;
  } | null;
  requestedAt: string;
  calledAt: string | null;
  graceEndsAt: string | null;
  startedAt: string | null;
  slotEndsAt: string | null;
}

export interface MyEvaluation {
  eventId: string;
  stage: TeamStage;
  team: { id: string; teamCode: string | null; name: string };
  rounds: TeamRound[];
  openRequest: TeamRequest | null;
  history: {
    id: string;
    roundName: string | null;
    status: EvalStatus;
    closedReason: string | null;
    evaluatorName: string | null;
    closedAt: string | null;
  }[];
}

export interface Evaluator {
  kind: 'JUDGE' | 'PANEL';
  /** User id (judge) or panel id. */
  id: string;
  name: string;
  location: string | null;
  online: boolean;
  isAvailable: boolean;
  waiting: number;
  busy: boolean;
  waitMinutes: number;
  alreadyEvaluated: boolean;
}

export const getMyEvaluation = (eventId: string) => call<MyEvaluation>(`/hackathon/${eventId}/evaluate`);
export const getEvaluators = (eventId: string, roundId: string) =>
  call<{ round: { id: string; name: string; kind: RoundKind; judgingMode: JudgingMode; slotMinutes: number }; evaluators: Evaluator[] }>(
    `/hackathon/${eventId}/rounds/${roundId}/evaluators`,
  );
export const requestEvaluation = (eventId: string, roundId: string, pick: { judgeUserId?: string; panelId?: string }) =>
  call<MyEvaluation>(`/hackathon/${eventId}/rounds/${roundId}/requests`, json('POST', pick));
export const leaveQueue = (eventId: string, requestId: string) =>
  call<MyEvaluation>(`/hackathon/${eventId}/requests/${requestId}`, json('DELETE'));

// ── Results & winners (Phase 4) ──────────────────────────────────────────────

export type ScoringMode = 'PER_ROUND' | 'CUMULATIVE';

export interface ResultEvaluation {
  judgmentId: string;
  judgeUserId: string;
  judgeName: string;
  submittedAt: string;
  editableUntil: string | null;
  locked: boolean;
  /** Weighted total of the marks. */
  total: number;
  marks: { metricId: string; value: number; comment: string | null }[];
  review: string | null;
}

export interface ResultRound {
  roundId: string;
  takesPart: boolean;
  standing: Standing;
  /** Average of the submitted evaluations; null when none. */
  score: number | null;
  /** Among teams evaluated in the round; null when unscored. */
  rank: number | null;
  evaluations: ResultEvaluation[];
  links: SubmissionLink[];
  linksNotes: string | null;
}

export interface ResultTeam {
  id: string;
  teamCode: string | null;
  name: string;
  stage: TeamStage;
  room: string | null;
  statement: { code: string | null; title: string; themeLabel: string | null } | null;
  /** Set when the statement changed after the team was evaluated. */
  psChangedAfterEvalAt: string | null;
  /** Final round score (PER_ROUND) or sum of counted rounds (CUMULATIVE). */
  total: number | null;
  rank: number | null;
  awards: { title: string; published: boolean }[];
  rounds: ResultRound[];
}

export interface HackathonResults {
  scoringMode: ScoringMode;
  revealReviews: boolean;
  canDeclareWinners: boolean;
  /** PER_ROUND: the round that decides; null for CUMULATIVE. */
  finalRoundId: string | null;
  rounds: {
    id: string;
    name: string;
    order: number;
    status: RoundStatus;
    kind: RoundKind;
    judgingMode: JudgingMode;
    eliminationEnabled: boolean;
    countsTowardTotal: boolean;
    criteria: { id: string; label: string; maxValue: number; weight: number }[];
    /** Best possible evaluation total. */
    maxScore: number;
  }[];
  /** Ranked teams first, then unranked. */
  teams: ResultTeam[];
}

export const getResults = (eventId: string) => call<HackathonResults>(`${base(eventId)}/results`);
/** Advance / eliminate several teams at once (the "top N" helper). */
export const setRoundDecisions = (eventId: string, roundId: string, decisions: { entrantId: string; status: Standing }[]) =>
  call<RoundDetail>(`${base(eventId)}/rounds/${roundId}/decisions`, json('PUT', { decisions }));

export interface Award {
  id: string;
  title: string;
  notes: string | null;
  order: number;
  published: boolean;
  declaredAt: string | null;
  team: { id: string; teamCode: string | null; name: string; cancelled: boolean };
}

export interface AwardsList {
  /** Curator / Space Admin; Co-Curators see the list read-only. */
  canDeclareWinners: boolean;
  awards: Award[];
  /** Teams that can win (in the hackathon, not cancelled). */
  teams: { id: string; teamCode: string | null; name: string }[];
}

export interface AwardInput {
  title?: string;
  entrantId?: string;
  notes?: string | null;
}

export const getAwards = (eventId: string) => call<AwardsList>(`${base(eventId)}/awards`);
export const createAward = (eventId: string, input: AwardInput & { title: string; entrantId: string }) =>
  call<AwardsList>(`${base(eventId)}/awards`, json('POST', input));
export const updateAward = (eventId: string, awardId: string, input: AwardInput) =>
  call<AwardsList>(`${base(eventId)}/awards/${awardId}`, json('PATCH', input));
export const deleteAward = (eventId: string, awardId: string) =>
  call<AwardsList>(`${base(eventId)}/awards/${awardId}`, json('DELETE'));
/** Publish every unpublished award (or the given ones); winners and everyone else are told. */
export const publishAwards = (eventId: string, awardIds?: string[]) =>
  call<AwardsList>(`${base(eventId)}/awards/publish`, json('POST', awardIds?.length ? { awardIds } : {}));
export const unpublishAward = (eventId: string, awardId: string) =>
  call<AwardsList>(`${base(eventId)}/awards/${awardId}/unpublish`, json('POST'));

/** The results CSV as text (the caller saves and shares it). */
export async function getResultsCsv(eventId: string): Promise<Result<string>> {
  const response = await makeAuthenticatedRequest(`${base(eventId)}/results.csv`);
  if (!response) return { ok: false, denied: false, message: 'No connection' };
  if (!response.ok) {
    let message = 'Could not export the results.';
    try {
      const body = await response.json();
      if (body?.message) message = String(body.message);
    } catch {
      /* keep default */
    }
    return { ok: false, denied: response.status === 403, message };
  }
  return { ok: true, data: await response.text() };
}

// ── Project links & announcements (Phase 5) ──────────────────────────────────

export interface SubmissionLink {
  label: string;
  url: string;
}

export interface MySubmissions {
  eventId: string;
  stage: TeamStage;
  team: { id: string; teamCode: string | null; name: string };
  rounds: {
    roundId: string;
    name: string;
    kind: RoundKind;
    status: RoundStatus;
    /** Links lock then (else when the round closes). */
    closesAt: string | null;
    canEdit: boolean;
    links: SubmissionLink[];
    notes: string | null;
    updatedAt: string | null;
    updatedBy: string | null;
  }[];
}

export const getMySubmissions = (eventId: string) => call<MySubmissions>(`/hackathon/${eventId}/submissions`);
export const saveMySubmission = (eventId: string, roundId: string, input: { links: { label?: string; url: string }[]; notes?: string | null }) =>
  call<MySubmissions>(`/hackathon/${eventId}/rounds/${roundId}/submission`, json('PUT', input));

export type AnnouncementAudience = 'ALL' | 'TEAMS' | 'JUDGES' | 'ROOM';

export interface Announcements {
  rooms: { id: string; name: string; teams: number }[];
  announcements: {
    id: string;
    audience: AnnouncementAudience;
    roomName: string | null;
    title: string;
    body: string;
    recipients: number;
    sentBy: string | null;
    createdAt: string;
  }[];
}

export const getAnnouncements = (eventId: string) => call<Announcements>(`${base(eventId)}/announcements`);
export const sendAnnouncement = (
  eventId: string,
  input: { audience: AnnouncementAudience; roomId?: string; title: string; body: string },
) => call<Announcements>(`${base(eventId)}/announcements`, json('POST', input));

// ── Help desk ────────────────────────────────────────────────────────────────

export type HelpQueryStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface HelpTopics {
  staff: StaffUser[];
  topics: { id: string; name: string; pocs: StaffUser[] }[];
}

/** A team's view: what it can ask about, its room's volunteers, its queries. */
export interface MyHelp {
  topics: { id: string; name: string }[];
  room: { name: string; volunteers: { name: string | null; avatarUrl: string | null }[] } | null;
  queries: {
    id: string;
    topicName: string;
    message: string;
    status: HelpQueryStatus;
    handledByName: string | null;
    createdAt: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
  }[];
}

export interface HelpInboxQuery {
  id: string;
  topicName: string;
  roomName: string | null;
  message: string;
  status: HelpQueryStatus;
  team: { teamCode: string | null; name: string };
  raisedByName: string | null;
  handledByName: string | null;
  handledByMe: boolean;
  sentToMe: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/** Null when the event runs no hackathon. Curators see every query. */
export type HelpInbox = { canManage: boolean; queries: HelpInboxQuery[] } | null;

export const getHelpTopics = (eventId: string) => call<HelpTopics>(`${base(eventId)}/help/topics`);
export const createHelpTopic = (eventId: string, input: { name: string; pocUserIds: string[] }) =>
  call<HelpTopics>(`${base(eventId)}/help/topics`, json('POST', input));
export const updateHelpTopic = (eventId: string, topicId: string, input: { name?: string; pocUserIds?: string[] }) =>
  call<HelpTopics>(`${base(eventId)}/help/topics/${topicId}`, json('PATCH', input));
export const deleteHelpTopic = (eventId: string, topicId: string) =>
  call<HelpTopics>(`${base(eventId)}/help/topics/${topicId}`, json('DELETE'));

export const getMyHelp = (eventId: string) => call<MyHelp>(`/hackathon/${eventId}/help`);
export const raiseHelpQuery = (eventId: string, input: { topicId: string | null; message: string }) =>
  call<MyHelp>(`/hackathon/${eventId}/help/queries`, json('POST', input));
export const getHelpInbox = (eventId: string) => call<HelpInbox>(`/hackathon/${eventId}/help/inbox`);
export const setHelpQueryStatus = (eventId: string, queryId: string, status: HelpQueryStatus) =>
  call<HelpInbox>(`/hackathon/${eventId}/help/queries/${queryId}/status`, { ...json('POST', { status }), retry: true });

export const HELP_STATUS_LABEL: Record<HelpQueryStatus, string> = { OPEN: 'Waiting', ACKNOWLEDGED: 'On it', RESOLVED: 'Resolved' };
export const staffName = (u: { fullName: string | null; username: string | null }) => u.fullName || u.username || 'Team member';

// ── Certificates (Phase 6) ───────────────────────────────────────────────────

export type CertificateBatchStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface CertificateBatch {
  id: string;
  status: CertificateBatchStatus;
  total: number;
  issued: number;
  reactivated: number;
  skipped: number;
  failed: number;
  error: string | null;
}

export interface HackathonCertificates {
  /** Curator / Space Admin (Co-Curators see this read-only). */
  canIssue: boolean;
  /** The space's plan includes certificates. */
  planAllowed: boolean;
  /** New certificates can be issued until the post-event window closes. */
  window: { closesAt: string; isOpen: boolean };
  templates: { id: string; name: string; backgroundUrl: string; usesTeam: boolean; usesAward: boolean }[];
  participants: { teams: number; people: number };
  winners: { awardId: string; title: string; team: { teamCode: string | null; name: string } }[];
  batches: (CertificateBatch & { label: string; kind: 'WINNERS' | 'PARTICIPANTS'; createdAt: string; finishedAt: string | null })[];
}

export const getHackathonCertificates = (eventId: string) => call<HackathonCertificates>(`${base(eventId)}/certificates`);
export const issueHackathonCertificates = (eventId: string, templateId: string, audience: 'PARTICIPANTS' | 'WINNERS') =>
  call<HackathonCertificates & { batchIds: string[] }>(`${base(eventId)}/certificates/issue`, json('POST', { templateId, audience }));
export const getCertificateBatch = (eventId: string, batchId: string) =>
  call<CertificateBatch>(`${base(eventId)}/certificates/batches/${batchId}`);
