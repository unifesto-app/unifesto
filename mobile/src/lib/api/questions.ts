import { call } from './manageEvent';

/*
 * L2 live Q&A. Attendees ask and upvote once each; organisers (event:edit)
 * moderate. Attendees see approved and answered questions, plus their own
 * still waiting for a moderator; never hidden ones.
 */

export type QuestionStatus = 'PENDING' | 'APPROVED' | 'HIDDEN' | 'ANSWERED';

export interface Question {
  id: string;
  text: string;
  status: QuestionStatus;
  pinned: boolean;
  agendaId: string | null;
  agendaTitle: string | null;
  author: string;
  votes: number;
  voted: boolean;
  mine: boolean;
  createdAt: string;
}

export interface QaBoard {
  premoderated: boolean;
  /** The event's agenda items (sessions/tracks) a question can be about. */
  sessions: { id: string; title: string }[];
  /** Pinned first, answered last, the rest by votes. */
  questions: Question[];
}

const base = (eventId: string) => `/events/${eventId}/questions`;
const q = (agendaId?: string | null) => (agendaId ? `?agendaId=${encodeURIComponent(agendaId)}` : '');
const json = (method: string, body?: object): RequestInit => ({ method, body: body ? JSON.stringify(body) : undefined });

// Attendee
export const getQaFeed = (eventId: string, agendaId?: string | null) => call<QaBoard>(`${base(eventId)}${q(agendaId)}`);
export const askQuestion = (eventId: string, text: string, agendaId?: string | null) =>
  call<{ ok: true; status: QuestionStatus }>(base(eventId), json('POST', { text, agendaId: agendaId || undefined }));
export const upvoteQuestion = (eventId: string, questionId: string, on: boolean) =>
  call<{ ok: true }>(`${base(eventId)}/${questionId}/vote`, json(on ? 'POST' : 'DELETE'));

// Organiser
export const getQaBoard = (eventId: string) => call<QaBoard>(`${base(eventId)}/manage`);
export const moderateQuestion = (eventId: string, questionId: string, change: { status?: Exclude<QuestionStatus, 'PENDING'>; pinned?: boolean }) =>
  call<{ ok: true }>(`${base(eventId)}/${questionId}`, json('PATCH', change));
export const setQaPremoderated = (eventId: string, premoderated: boolean) =>
  call<{ ok: true }>(`${base(eventId)}/settings`, json('PATCH', { premoderated }));
