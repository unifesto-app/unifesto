/*
 * F1 event feedback, team side: switch it on or off and manage the curators'
 * own questions. The fixed 1-5 rating and NPS are always asked.
 */
import { call } from './call';
import type { EventFormField } from './events-api';
import type { QuestionPayload } from '@/components/events/form-fields-manager';

export type FeedbackQuestion = Omit<EventFormField, 'ticketTypeId' | 'perGroup'>;
export interface FeedbackForm {
  enabled: boolean;
  questions: FeedbackQuestion[];
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
/** Feedback questions have no per-group choice. */
const body = ({ perGroup: _perGroup, ...b }: Partial<QuestionPayload>) => b;

export const getFeedbackForm = (eventId: string) => call<FeedbackForm>(`/events/${eventId}/feedback/manage`);
export const setFeedbackEnabled = (eventId: string, enabled: boolean) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/settings`, json('PATCH', { enabled }));
export const createFeedbackQuestion = (eventId: string, b: QuestionPayload) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions`, json('POST', body(b)));
export const updateFeedbackQuestion = (eventId: string, id: string, b: QuestionPayload) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions/${id}`, json('PATCH', body(b)));
export const deleteFeedbackQuestion = (eventId: string, id: string) =>
  call<FeedbackForm>(`/events/${eventId}/feedback/questions/${id}`, { method: 'DELETE' });
