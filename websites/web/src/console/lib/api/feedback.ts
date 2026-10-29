/*
 * F1 event feedback, team side: switch it on or off and manage the curators'
 * own questions. The fixed 1-5 rating and NPS are always asked. Checked-in
 * attendees are asked 2 h after the end, reminded at 48 h; it closes at 7 days (F2).
 */
import { authedFetch, call, type Result } from './call';
import type { EventFormField } from './events-api';
import type { QuestionPayload } from '@/console/components/events/form-fields-manager';

export type FeedbackQuestion = Omit<EventFormField, 'ticketTypeId' | 'perGroup'>;
export interface FeedbackForm {
  enabled: boolean;
  /** Hold attendees' certificates until they give feedback (F2). */
  unlocksCertificate: boolean;
  /** Show the average on the public event page once 5+ have rated (F3). */
  public: boolean;
  questions: FeedbackQuestion[];
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
/** Feedback questions have no per-group choice. */
const body = ({ perGroup: _perGroup, ...b }: Partial<QuestionPayload>) => b;

export const getFeedbackForm = (eventId: string) => call<FeedbackForm>(`/events/${eventId}/feedback/manage`);
export const setFeedbackSettings = (
  eventId: string,
  patch: { enabled?: boolean; unlocksCertificate?: boolean; public?: boolean },
) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/settings`, json('PATCH', patch));
export const createFeedbackQuestion = (eventId: string, b: QuestionPayload) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions`, json('POST', body(b)));
export const updateFeedbackQuestion = (eventId: string, id: string, b: QuestionPayload) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions/${id}`, json('PATCH', body(b)));
export const deleteFeedbackQuestion = (eventId: string, id: string) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions/${id}`, { method: 'DELETE' });

/** F3: one curator question, summarised by its type. */
export interface QuestionSummary {
  id: string;
  label: string;
  type: string;
  answered: number;
  average?: number | null;
  options?: { option: string; count: number }[];
  texts?: string[];
}

export interface FeedbackResults {
  count: number;
  public: boolean;
  averageRating: number | null;
  distribution: { value: number; count: number }[];
  nps: { score: number | null; answered: number; promoters: number; passives: number; detractors: number };
  questions: QuestionSummary[];
  comments: { rating: number; comment: string; createdAt: string }[];
}

export const getFeedbackResults = (eventId: string) => call<FeedbackResults>(`/events/${eventId}/feedback/results`);

/** Every response as CSV text (the caller saves it). */
export async function getFeedbackCsv(eventId: string): Promise<Result<string>> {
  try {
    const response = await authedFetch(`/events/${eventId}/feedback/results.csv`);
    if (!response.ok) return { ok: false, denied: response.status === 403, message: 'Could not export the feedback.' };
    return { ok: true, data: await response.text() };
  } catch {
    return { ok: false, denied: false, message: 'No connection' };
  }
}
