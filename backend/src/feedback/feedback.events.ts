/** Emitted after an attendee saves feedback; certificates held for it go out (F2). */
export const FEEDBACK_SUBMITTED = 'feedback.submitted';
export interface FeedbackSubmittedEvent {
  eventId: string;
  userId: string;
}
