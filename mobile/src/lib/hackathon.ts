/**
 * Hackathon helpers with no React in them: the Team ID preview (mirrors the
 * backend's hackathon.shared.ts so the settings preview matches what import
 * hands out), stage copy, and the maps link for the venue.
 */

import { Platform } from 'react-native';
import type { TeamStage, Venue } from './api/hackathon';

/** Same rule the server enforces for the prefix. */
export const TEAM_CODE_PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9_\-/.]{0,19}$/;

/** HACK25- + 3 + 7 → "HACK25-007". */
export function formatTeamCode(prefix: string, digits: number, n: number): string {
  return `${prefix}${String(n).padStart(digits, '0')}`;
}

/** What the team hub says at each stage. */
export function stageCopy(stage: TeamStage): { title: string; body: string } {
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
