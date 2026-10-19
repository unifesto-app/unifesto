/**
 * Live quizzes (L3) — backed by `/events/:eventId/quizzes`. Management routes
 * are gated server-side by @Can(event:edit). The server owns every clock:
 * compare its times against `serverNow`, not this browser's clock.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type QuizStatus = "DRAFT" | "LIVE" | "ENDED";

export interface QuizQuestionInput {
  prompt: string;
  options: string[];
  correctIndexes: number[];
  timeLimitSec: number;
  points: number;
}

export interface QuizInput {
  title: string;
  speedBonus: boolean;
  questions: QuizQuestionInput[];
}

export interface ManagedQuizQuestion extends QuizQuestionInput {
  id: string;
  position: number;
  openedAt: string | null;
  closesAt: string | null;
  revealAt: string | null;
  closed: boolean;
  /** Answers per option, same order as `options`. */
  results: number[];
  answered: number;
}

export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  isMe: boolean;
}

export interface Leaderboard {
  players: number;
  top: BoardRow[];
  me: BoardRow | null;
}

export interface ManagedQuiz {
  id: string;
  title: string;
  status: QuizStatus;
  speedBonus: boolean;
  currentIndex: number | null;
  serverNow: string;
  questions: ManagedQuizQuestion[];
  /** Closed questions only; null for drafts. */
  leaderboard: Leaderboard | null;
}

type Res<T> = Promise<{ data: T | null; error: ApiError | null }>;
type Ok = { ok: true };
const base = (eventId: string) => `/events/${eventId}/quizzes`;

export const getQuizzes = (eventId: string): Res<ManagedQuiz[]> =>
  apiCall<ManagedQuiz[]>(backendClient.get(`${base(eventId)}/manage`));

export const createQuiz = (eventId: string, input: QuizInput): Res<unknown> =>
  apiCall(backendClient.post(base(eventId), input));

export const updateQuiz = (eventId: string, quizId: string, input: QuizInput): Res<Ok> =>
  apiCall<Ok>(backendClient.put(`${base(eventId)}/${quizId}`, input));

const step = (action: "start" | "next" | "close-question" | "end") => (eventId: string, quizId: string): Res<Ok> =>
  apiCall<Ok>(backendClient.post(`${base(eventId)}/${quizId}/${action}`));

export const startQuiz = step("start");
export const nextQuestion = step("next");
export const closeQuestion = step("close-question");
export const endQuiz = step("end");

export const deleteQuiz = (eventId: string, quizId: string): Res<Ok> =>
  apiCall<Ok>(backendClient.delete(`${base(eventId)}/${quizId}`));
