import { call } from './manageEvent';

/*
 * L3 live quizzes. The server owns the clock: every time here is the server's,
 * so compare against `serverNow` (shifted by the skew at fetch), never the
 * phone's clock alone. The right answer is null until the question closes.
 */

export type QuizStatus = 'DRAFT' | 'LIVE' | 'ENDED';

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

export interface FeedQuestion {
  id: string;
  position: number;
  prompt: string;
  options: string[];
  timeLimitSec: number;
  points: number;
  openedAt: string | null;
  closesAt: string | null;
  /** When the right answer and scores come out (deadline plus a short grace). */
  revealAt: string | null;
  closed: boolean;
  correctIndexes: number[] | null;
  myAnswer: { optionIndex: number; correct: boolean | null; points: number | null } | null;
}

export interface QuizFeed {
  serverNow: string;
  quiz: {
    id: string;
    title: string;
    status: QuizStatus;
    speedBonus: boolean;
    questionCount: number;
    question: FeedQuestion | null;
    leaderboard: Leaderboard;
  } | null;
}

export interface ManagedQuiz {
  id: string;
  title: string;
  status: QuizStatus;
  currentIndex: number | null;
  serverNow: string;
  questions: (Omit<FeedQuestion, 'correctIndexes' | 'myAnswer'> & { correctIndexes: number[]; results: number[]; answered: number })[];
  leaderboard: Leaderboard | null;
}

const base = (eventId: string) => `/events/${eventId}/quizzes`;
const post = (body?: object): RequestInit => ({ method: 'POST', body: body ? JSON.stringify(body) : undefined });

// Attendee
export const getQuizFeed = (eventId: string) => call<QuizFeed>(base(eventId));
export const answerQuiz = (eventId: string, quizId: string, questionId: string, optionIndex: number) =>
  call<QuizFeed>(`${base(eventId)}/${quizId}/answer`, post({ questionId, optionIndex }));

// Organiser (quizzes are built on the web; the app runs them)
export const getManagedQuizzes = (eventId: string) => call<ManagedQuiz[]>(`${base(eventId)}/manage`);
export const stepQuiz = (eventId: string, quizId: string, action: 'start' | 'next' | 'close-question' | 'end') =>
  call<{ ok: true }>(`${base(eventId)}/${quizId}/${action}`, post());
