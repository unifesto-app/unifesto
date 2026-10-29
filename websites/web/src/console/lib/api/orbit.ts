import { call } from './call';

/*
 * Unifesto Orbit: the Orbit Lead's view of their campus. Gated server-side by
 * space:manage-members on the campus space. Counts only, never clubs' money.
 */

export type OrbitTierName = 'Probation' | 'Lead' | 'Bronze' | 'Silver' | 'Gold';

export interface OrbitCampusView {
  spaceId: string;
  name: string;
  leads: {
    id: string;
    user: { id: string; fullName: string | null; username: string | null; email: string | null };
    joinedAt: string;
    examPauseUntil: string | null;
    probationEndsAt: string;
  }[];
  clubs: number;
  activeClubs: number;
  publishedEvents: number;
  paidEvents: number;
  tier: number;
  tierName: OrbitTierName;
  lastActivityAt: string | null;
  clock: { inactiveDays: number; status: 'active' | 'paused' | 'check-in' | 'reopen' } | null;
  clubList: { id: string; name: string; slug: string; publishedEvents: number; joinedAt: string }[];
  rank: number;
  campusCount: number;
  /** What the next tier needs; null once Gold. */
  nextGoal: { tier: OrbitTierName; clubs?: number; activeClubs?: number; paidEvents?: number } | null;
}

/** GET /orbit/space/:id */
export const getOrbitCampus = (spaceId: string) => call<OrbitCampusView>(`/orbit/space/${spaceId}`);
