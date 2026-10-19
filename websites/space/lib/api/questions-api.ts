/**
 * Live Q&A (L2) — backed by `/events/:eventId/questions`. Moderation routes
 * are gated server-side by @Can(event:edit).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type QuestionStatus = "PENDING" | "APPROVED" | "HIDDEN" | "ANSWERED";

export interface Question {
  id: string;
  text: string;
  status: QuestionStatus;
  pinned: boolean;
  agendaId: string | null;
  agendaTitle: string | null;
  author: string;
  votes: number;
  answeredAt: string | null;
  createdAt: string;
}

export interface QaBoard {
  premoderated: boolean;
  /** The event's agenda items, for the session filter. */
  sessions: { id: string; title: string }[];
  /** Pinned first, answered last, the rest by votes. */
  questions: Question[];
}

type Res<T> = Promise<{ data: T | null; error: ApiError | null }>;
type Ok = { ok: true };

export const getQaBoard = (eventId: string, agendaId?: string): Res<QaBoard> =>
  apiCall<QaBoard>(backendClient.get(`/events/${eventId}/questions/manage`, { params: agendaId ? { agendaId } : undefined }));

export const moderateQuestion = (
  eventId: string,
  questionId: string,
  change: { status?: "APPROVED" | "HIDDEN" | "ANSWERED"; pinned?: boolean },
): Res<Ok> => apiCall<Ok>(backendClient.patch(`/events/${eventId}/questions/${questionId}`, change));

export const setQaPremoderated = (eventId: string, premoderated: boolean): Res<Ok> =>
  apiCall<Ok>(backendClient.patch(`/events/${eventId}/questions/settings`, { premoderated }));
