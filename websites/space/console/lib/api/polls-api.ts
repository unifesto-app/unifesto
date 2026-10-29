/**
 * Live polls (L1) — backed by `/events/:eventId/polls`. Management routes are
 * gated server-side by @Can(event:edit).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type PollStatus = "DRAFT" | "LIVE" | "CLOSED";
export type PollResultsVisibility = "AFTER_VOTE" | "AFTER_CLOSE" | "ORGANISERS_ONLY";

export interface Poll {
  id: string;
  question: string;
  options: string[];
  status: PollStatus;
  resultsVisibility: PollResultsVisibility;
  /** Votes per option, same order as `options`. */
  results: number[];
  totalVotes: number;
  launchedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface PollInput {
  question: string;
  options: string[];
  resultsVisibility: PollResultsVisibility;
}

type Res<T> = Promise<{ data: T | null; error: ApiError | null }>;
type Ok = { ok: true };

export const getPolls = (eventId: string): Res<Poll[]> =>
  apiCall<Poll[]>(backendClient.get(`/events/${eventId}/polls/manage`));

export const createPoll = (eventId: string, input: PollInput): Res<Poll> =>
  apiCall<Poll>(backendClient.post(`/events/${eventId}/polls`, input));

export const launchPoll = (eventId: string, pollId: string): Res<Ok> =>
  apiCall<Ok>(backendClient.post(`/events/${eventId}/polls/${pollId}/launch`));

export const closePoll = (eventId: string, pollId: string): Res<Ok> =>
  apiCall<Ok>(backendClient.post(`/events/${eventId}/polls/${pollId}/close`));

export const setPollVisibility = (eventId: string, pollId: string, resultsVisibility: PollResultsVisibility): Res<Ok> =>
  apiCall<Ok>(backendClient.patch(`/events/${eventId}/polls/${pollId}`, { resultsVisibility }));

export const deletePoll = (eventId: string, pollId: string): Res<Ok> =>
  apiCall<Ok>(backendClient.delete(`/events/${eventId}/polls/${pollId}`));
