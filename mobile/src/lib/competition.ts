import type { EntrantRoundStatus, ParticipantRound, ParticipantView } from './api/leaderboard';

/*
 * Pure helpers for the participant competition screen. Everything here reads
 * round decisions (advanced / eliminated / pending) only; the participant API
 * never carries marks, and nothing here tries to rank teams.
 */

export type Standing =
  | { kind: 'spectator' } // registered, but not linked to any team
  | { kind: 'waiting'; round: string } // no decision yet in the current round
  | { kind: 'in'; round: string; next: string | null } // advanced out of `round`
  | { kind: 'out'; round: string }; // eliminated in `round`

export interface JourneyStep {
  roundId: string;
  name: string;
  roundStatus: ParticipantRound['status'];
  status: EntrantRoundStatus;
}

/** One team's path through the rounds, in order. */
export function journeyFor(view: ParticipantView, entrantId: string): JourneyStep[] {
  return [...view.rounds]
    .sort((a, b) => a.order - b.order)
    .map((r) => ({
      roundId: r.id,
      name: r.name,
      roundStatus: r.status,
      status: r.entrants.find((e) => e.id === entrantId)?.status ?? 'PENDING',
    }));
}

/**
 * Where a team stands right now. An elimination anywhere ends the run; otherwise
 * the last advanced round wins, unless a later round has already started, in
 * which case they're waiting on that one.
 */
export function standingOf(steps: JourneyStep[]): Standing {
  if (steps.length === 0) return { kind: 'waiting', round: 'the first round' };
  const out = steps.find((s) => s.status === 'ELIMINATED');
  if (out) return { kind: 'out', round: out.name };

  let lastAdvanced = -1;
  steps.forEach((s, i) => {
    if (s.status === 'ADVANCED') lastAdvanced = i;
  });
  const next = steps[lastAdvanced + 1] ?? null;
  if (lastAdvanced >= 0 && (!next || next.roundStatus === 'PENDING')) {
    return { kind: 'in', round: steps[lastAdvanced].name, next: next?.name ?? null };
  }
  // First undecided round that has opened, else the first undecided one.
  const current = steps.find((s, i) => i > lastAdvanced && s.roundStatus !== 'PENDING') ?? next ?? steps[0];
  return { kind: 'waiting', round: current.name };
}

/**
 * The round the bracket opens on: the latest round with any decision, else the
 * first round that has started, else the first round.
 */
export function defaultBracketRound(view: ParticipantView): string {
  const rounds = [...view.rounds].sort((a, b) => a.order - b.order);
  const decided = [...rounds].reverse().find((r) => r.entrants.some((e) => e.status !== 'PENDING'));
  return (decided ?? rounds.find((r) => r.status !== 'PENDING') ?? rounds[0])?.id ?? '';
}

/** Advanced first, then undecided, then eliminated; own team pinned to the top of its group. */
export function sortBracket(entrants: ParticipantRound['entrants']) {
  const rank: Record<EntrantRoundStatus, number> = { ADVANCED: 0, PENDING: 1, ELIMINATED: 2 };
  return [...entrants].sort(
    (a, b) => rank[a.status] - rank[b.status] || Number(b.isMine) - Number(a.isMine) || a.name.localeCompare(b.name),
  );
}
