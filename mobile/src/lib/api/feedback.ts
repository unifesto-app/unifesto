/** F1 event feedback, attendee side: the form and my own response. */
import { call } from './manageEvent';
import type { FormFieldConfig } from '../../utils/formQuestions';
import type { FormFieldType } from './ticketTypes';
import { FIELD_TYPE_MAP, type CustomField } from './tickets';

export interface FeedbackQuestion {
  id: string;
  label: string;
  type: FormFieldType;
  options: string[];
  isRequired: boolean;
  order: number;
  helpText: string | null;
  config: FormFieldConfig | null;
  showIf: { fieldId: string; anyOf: string[] } | null;
}

export interface FeedbackResponse {
  rating: number;
  nps: number | null;
  comment: string | null;
  answers: Record<string, unknown> | null;
}

export interface FeedbackForm {
  event: { id: string; title: string };
  enabled: boolean;
  /** I attend, the event has started and feedback hasn't closed (7 days after the end). */
  open: boolean;
  closesAt: string;
  /** My certificate for this event waits for my feedback (F2). */
  unlocksCertificate: boolean;
  questions: FeedbackQuestion[];
  response: FeedbackResponse | null;
}

export const getFeedback = (eventId: string) => call<FeedbackForm>(`/events/${eventId}/feedback`);

export const submitFeedback = (
  eventId: string,
  body: { rating: number; nps?: number | null; comment?: string; answers: Record<string, unknown> },
) => call<FeedbackResponse>(`/events/${eventId}/feedback`, { method: 'PUT', body: JSON.stringify(body) });

/** A feedback question in the shape CustomFieldInput renders (no file answers). */
export function toCustomField(q: FeedbackQuestion, eventId: string): CustomField {
  return {
    id: q.id,
    event_id: eventId,
    label: q.label,
    field_type: q.type === 'CHECKBOX' && q.options?.length ? 'multi_select' : FIELD_TYPE_MAP[q.type] ?? 'text',
    is_required: q.isRequired,
    help_text: q.helpText || undefined,
    config: q.config ?? undefined,
    show_if: q.showIf ? { field_id: q.showIf.fieldId, any_of: q.showIf.anyOf } : null,
    options_json: (q.options ?? []).map((o) => ({ label: o, value: o })),
    display_order: q.order,
    created_at: '',
    updated_at: '',
  };
}
