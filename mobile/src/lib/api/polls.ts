import { call } from './manageEvent';

/*
 * L1 live polls. Organisers (event:edit) manage; attendees read the feed and
 * vote once each. `results` is null when this person may not see counts yet.
 */

export type PollStatus = 'DRAFT' | 'LIVE' | 'CLOSED';
export type PollResultsVisibility = 'AFTER_VOTE' | 'AFTER_CLOSE' | 'ORGANISERS_ONLY';

export interface Poll {
  id: string;
  question: string;
  options: string[];
  status: PollStatus;
  resultsVisibility: PollResultsVisibility;
  results: number[] | null;
  totalVotes: number | null;
}

export interface FeedPoll extends Poll {
  myVote: number | null;
}

const base = (eventId: string) => `/events/${eventId}/polls`;
const post = (body?: object): RequestInit => ({ method: 'POST', body: body ? JSON.stringify(body) : undefined });

// Attendee
export const getPollFeed = (eventId: string) => call<{ polls: FeedPoll[] }>(base(eventId));
export const votePoll = (eventId: string, pollId: string, optionIndex: number) =>
  call<{ polls: FeedPoll[] }>(`${base(eventId)}/${pollId}/vote`, post({ optionIndex }));

// Organiser
export const getManagedPolls = (eventId: string) => call<Poll[]>(`${base(eventId)}/manage`);
export const createPoll = (eventId: string, body: { question: string; options: string[]; resultsVisibility: PollResultsVisibility }) =>
  call<Poll>(base(eventId), post(body));
export const launchPoll = (eventId: string, pollId: string) => call<{ ok: true }>(`${base(eventId)}/${pollId}/launch`, post());
export const closePoll = (eventId: string, pollId: string) => call<{ ok: true }>(`${base(eventId)}/${pollId}/close`, post());
export const deletePoll = (eventId: string, pollId: string) => call<{ ok: true }>(`${base(eventId)}/${pollId}`, { method: 'DELETE' });
