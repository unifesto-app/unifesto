/** Unifesto Orbit tiers, lowest first. Index = rank on the leaderboard. */
export const ORBIT_TIERS = ['Probation', 'Lead', 'Bronze', 'Silver', 'Gold'] as const;

export const ORBIT_PROBATION_DAYS = 30;
/** No new active club or event for this long → the Program Lead checks in. */
export const ORBIT_CHECKIN_DAYS = 60;
/** …and 30 days of grace after that → the seat can be reopened. */
export const ORBIT_REOPEN_DAYS = 90;

const DAY_MS = 86_400_000;

type OrbitStats = { clubs: number; activeClubs: number; paidEvents: number };

/** What each tier above Probation needs. ORBIT_GOALS[i] earns ORBIT_TIERS[i + 1]. */
export const ORBIT_GOALS: ReadonlyArray<{ tier: (typeof ORBIT_TIERS)[number] } & Partial<OrbitStats>> = [
  { tier: 'Lead', clubs: 2 }, // soft probation: 2 clubs onboarded
  { tier: 'Bronze', activeClubs: 5 },
  { tier: 'Silver', activeClubs: 10, paidEvents: 1 },
  { tier: 'Gold', activeClubs: 15 },
];

/**
 * A campus's Orbit tier from its rolled-up numbers: the highest goal met.
 * "Active" club = published at least one event. Gold-by-fest is awarded by
 * hand, not detected here.
 */
export function orbitTier(s: OrbitStats): number {
  for (let i = ORBIT_GOALS.length - 1; i >= 0; i--) {
    const { tier: _name, ...goal } = ORBIT_GOALS[i];
    if ((Object.keys(goal) as (keyof OrbitStats)[]).every((k) => s[k] >= goal[k]!)) return i + 1;
  }
  return 0;
}

export type OrbitClockStatus = 'active' | 'paused' | 'check-in' | 'reopen';

/**
 * The inactivity clock. It runs from the latest of: the Lead joining, the last
 * club joining or event published, and the end of a declared exam window.
 * Undeclared exams don't pause it.
 */
export function orbitClock(
  a: { joinedAt: Date; lastActivityAt: Date | null; examPauseUntil: Date | null },
  now = new Date(),
): { inactiveDays: number; status: OrbitClockStatus } {
  if (a.examPauseUntil && a.examPauseUntil > now) return { inactiveDays: 0, status: 'paused' };
  const from = Math.max(
    a.joinedAt.getTime(),
    a.lastActivityAt?.getTime() ?? 0,
    a.examPauseUntil?.getTime() ?? 0,
  );
  const inactiveDays = Math.max(0, Math.floor((now.getTime() - from) / DAY_MS));
  const status =
    inactiveDays >= ORBIT_REOPEN_DAYS ? 'reopen' : inactiveDays >= ORBIT_CHECKIN_DAYS ? 'check-in' : 'active';
  return { inactiveDays, status };
}
