import { orbitClock, orbitTier, ORBIT_TIERS } from './orbit-tier';

describe('orbitTier', () => {
  const tier = (clubs: number, activeClubs: number, paidEvents = 0) =>
    ORBIT_TIERS[orbitTier({ clubs, activeClubs, paidEvents })];

  it('follows the Unifesto Orbit tier rules', () => {
    expect(tier(1, 0)).toBe('Probation');
    expect(tier(2, 0)).toBe('Lead'); // soft probation: 2 clubs onboarded, no event needed
    expect(tier(6, 5)).toBe('Bronze');
    expect(tier(12, 10)).toBe('Bronze'); // Silver also needs a paid event
    expect(tier(12, 10, 1)).toBe('Silver');
    expect(tier(15, 15)).toBe('Gold');
  });
});

describe('orbitClock', () => {
  const now = new Date('2027-03-01T00:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it('runs from the latest activity and flags check-in and reopen', () => {
    expect(orbitClock({ joinedAt: daysAgo(100), lastActivityAt: daysAgo(10), examPauseUntil: null }, now)).toEqual({ inactiveDays: 10, status: 'active' });
    expect(orbitClock({ joinedAt: daysAgo(100), lastActivityAt: daysAgo(61), examPauseUntil: null }, now).status).toBe('check-in');
    expect(orbitClock({ joinedAt: daysAgo(100), lastActivityAt: null, examPauseUntil: null }, now).status).toBe('reopen');
    // A new Lead's clock starts when they join, not at the campus's old activity.
    expect(orbitClock({ joinedAt: daysAgo(5), lastActivityAt: daysAgo(200), examPauseUntil: null }, now).inactiveDays).toBe(5);
  });

  it('pauses for a declared exam window and restarts when it ends', () => {
    expect(orbitClock({ joinedAt: daysAgo(100), lastActivityAt: daysAgo(80), examPauseUntil: daysAgo(-3) }, now).status).toBe('paused');
    expect(orbitClock({ joinedAt: daysAgo(100), lastActivityAt: daysAgo(80), examPauseUntil: daysAgo(4) }, now).inactiveDays).toBe(4);
  });
});
