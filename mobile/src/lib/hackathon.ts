/**
 * Hackathon helpers with no React in them: the Team ID preview (mirrors the
 * backend's hackathon.shared.ts so the settings preview matches what import
 * hands out), stage copy, and the maps link for the venue.
 */

import { Platform } from 'react-native';
import type { PsMode, StatementBlock, TeamStage, ThemeMode, Venue } from './api/hackathon';

/** Same rule the server enforces for the prefix. */
export const TEAM_CODE_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,19}$/;

/** HACK25- + 3 + 7 → "HACK25-007". */
export function formatTeamCode(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/**
 * What the team hub says at each stage. While the team still needs a problem
 * statement, what it says depends on why (`block`) and on the deadline.
 */
export function stageCopy(
  stage: TeamStage,
  block: StatementBlock | null = null,
  deadline: string | null = null,
): { title: string; body: string } {
  if (stage === 'NEEDS_PS' && block !== 'NOT_OPEN') {
    if (block === 'CURATOR_ASSIGNS' || block === 'DEADLINE_PASSED') {
      return {
        title: 'Waiting for your problem statement',
        body: 'The organisers will assign your team’s problem statement. We’ll notify you.',
      };
    }
    return {
      title: 'Next: lock in your problem statement',
      body: deadline
        ? `Choose it before ${formatWhen(deadline)} to unlock the hackathon.`
        : 'Choose it to unlock the hackathon for your team.',
    };
  }
  switch (stage) {
    case 'CANCELLED':
      return {
        title: 'Registration cancelled',
        body: 'This team’s registration was cancelled. Your Team ID stays on record. Contact the organisers if this is a mistake.',
      };
    case 'NEEDS_PS':
      return {
        title: 'Next: your problem statement',
        body: 'Once problem statements open, lock one in here to unlock the hackathon. We’ll notify you.',
      };
    case 'ACTIVE':
      return { title: 'You’re in', body: 'Your problem statement is locked in. Good luck!' };
    case 'ELIMINATED':
      return { title: 'Your run has ended', body: 'Thanks for competing. Results and winners show up here.' };
  }
}

/** A tappable maps link: the curator's own link, else coordinates, else the address. */
export function venueMapsUrl(v: Venue): string | null {
  if (v.mapUrl) return v.mapUrl;
  const label = [v.name, v.address].filter(Boolean).join(', ');
  if (v.lat != null && v.lng != null) {
    return Platform.OS === 'ios'
      ? `https://maps.apple.com/?ll=${v.lat},${v.lng}${label ? `&q=${encodeURIComponent(label)}` : ''}`
      : `https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`;
  }
  if (!label) return null;
  return Platform.OS === 'ios'
    ? `https://maps.apple.com/?q=${encodeURIComponent(label)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`;
}

/** "5 of 8 joined" — people who can open the hackathon out of the team size. */
export function joinedLabel(joined: number, size: number | null): string {
  return size ? `${joined} of ${size} joined` : `${joined} joined`;
}

/** "Sat 4 Oct, 6:00 pm". */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/** How the curator can hand out problem statements. */
export const PS_MODE_OPTIONS: { value: PsMode | 'OFF'; label: string; hint: string }[] = [
  { value: 'OFF', label: 'Not open yet', hint: 'Teams wait. Open it when your list is ready.' },
  { value: 'TEAM_PICKS', label: 'Teams pick', hint: 'Each team picks one from your list.' },
  { value: 'TEAM_WRITES', label: 'Teams write', hint: 'Each team writes its own problem statement.' },
  { value: 'CURATOR_ASSIGNS', label: 'You assign', hint: 'You give each team a statement from your list.' },
];

export const THEME_MODE_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'LIST', label: 'From your list', hint: 'Teams pick one of your themes (a statement’s own theme wins).' },
  { value: 'TEXT', label: 'Teams type it', hint: 'Teams type a short theme or domain.' },
];

/** One line for the curator: how statements are handed out right now. */
export function psModeSummary(mode: PsMode | null, deadline: string | null, now = Date.now()): string {
  const option = PS_MODE_OPTIONS.find((o) => o.value === (mode ?? 'OFF'))!;
  if (!mode || mode === 'CURATOR_ASSIGNS' || !deadline) return option.label;
  return new Date(deadline).getTime() <= now
    ? `${option.label} · closed ${formatWhen(deadline)}`
    : `${option.label} · until ${formatWhen(deadline)}`;
}

/** What the team's statement screen says when it can't choose (null once it's locked: the statement shows instead). */
export function blockCopy(block: StatementBlock): { title: string; body: string } | null {
  switch (block) {
    case 'NOT_OPEN':
      return { title: 'Not open yet', body: 'The organisers haven’t opened problem statements. We’ll notify you when they do.' };
    case 'CURATOR_ASSIGNS':
      return { title: 'Assigned by the organisers', body: 'The organisers will give your team its problem statement. We’ll notify you.' };
    case 'DEADLINE_PASSED':
      return {
        title: 'The deadline has passed',
        body: 'Teams can no longer choose. The organisers will assign your problem statement.',
      };
    case 'LOCKED':
      return null;
  }
}

/** "3 places left" / "Full" / null when there's no limit. */
export function placesLabel(placesLeft: number | null): string | null {
  if (placesLeft == null) return null;
  if (placesLeft === 0) return 'Full';
  return `${placesLeft} place${placesLeft === 1 ? '' : 's'} left`;
}
