import {
  criterionKey,
  editableUntil,
  effectiveStatus,
  estimatedWaitMinutes,
  evaluationsRequired,
  graceEndsAt,
  isEliminated,
  judgeTakesTheme,
  judgmentLocked,
  normalizeMobile,
  roundConfigError,
  takesPart,
  teamStage,
  undecidedBefore,
  type RoundRef,
  type RoundStanding,
} from './hackathon.shared';

/** Judges, rounds and the evaluation queue (Phase 3): the pure rules. */
describe('hackathon judging rules', () => {
  const at = (iso: string) => new Date(iso);

  describe('effectiveStatus', () => {
    it('treats a running slot whose time is up as awaiting marks', () => {
      const now = at('2026-10-01T10:10:00Z');
      expect(effectiveStatus({ status: 'IN_PROGRESS', slotEndsAt: at('2026-10-01T10:10:00Z') }, now)).toBe('AWAITING_MARKS');
      expect(effectiveStatus({ status: 'IN_PROGRESS', slotEndsAt: at('2026-10-01T10:11:00Z') }, now)).toBe('IN_PROGRESS');
      expect(effectiveStatus({ status: 'WAITING', slotEndsAt: null }, now)).toBe('WAITING');
    });
  });

  describe('the 5-minute lock', () => {
    it('runs 5 minutes from the first submit', () => {
      const submittedAt = at('2026-10-01T10:00:00Z');
      expect(editableUntil({ submittedAt, reopenedAt: null })).toEqual(at('2026-10-01T10:05:00Z'));
      expect(judgmentLocked({ submittedAt, reopenedAt: null }, at('2026-10-01T10:04:59Z'))).toBe(false);
      expect(judgmentLocked({ submittedAt, reopenedAt: null }, at('2026-10-01T10:05:00Z'))).toBe(true);
    });

    it('restarts from a curator reopen', () => {
      const j = { submittedAt: at('2026-10-01T10:00:00Z'), reopenedAt: at('2026-10-01T11:00:00Z') };
      expect(editableUntil(j)).toEqual(at('2026-10-01T11:05:00Z'));
      expect(judgmentLocked(j, at('2026-10-01T11:03:00Z'))).toBe(false);
    });

    it('never locks a draft', () => {
      expect(editableUntil({ submittedAt: null, reopenedAt: null })).toBeNull();
      expect(judgmentLocked({ submittedAt: null, reopenedAt: null }, new Date())).toBe(false);
    });
  });

  it('grace ends callGraceMinutes after the call', () => {
    expect(graceEndsAt(at('2026-10-01T10:00:00Z'), 3)).toEqual(at('2026-10-01T10:03:00Z'));
    expect(graceEndsAt(null, 3)).toBeNull();
  });

  describe('round settings', () => {
    it('needs one evaluation, or N with several judges', () => {
      expect(evaluationsRequired({ judgingMode: 'SINGLE', requiredEvaluations: 3 })).toBe(1);
      expect(evaluationsRequired({ judgingMode: 'PANEL', requiredEvaluations: 3 })).toBe(1);
      expect(evaluationsRequired({ judgingMode: 'MULTI', requiredEvaluations: 3 })).toBe(3);
    });

    it('several judges means at least 2 evaluations', () => {
      expect(roundConfigError({ judgingMode: 'MULTI', requiredEvaluations: 1 })).toMatch(/between 2/);
      expect(roundConfigError({ judgingMode: 'MULTI', requiredEvaluations: 2 })).toBeNull();
      expect(roundConfigError({ judgingMode: 'SINGLE', requiredEvaluations: 1 })).toBeNull();
    });
  });

  describe('who takes part in a round', () => {
    const rounds: RoundRef[] = [
      { id: 'r1', order: 1, eliminationEnabled: true },
      { id: 'r2', order: 2, eliminationEnabled: false },
      { id: 'r3', order: 3, eliminationEnabled: true },
    ];
    const standing = (m: Record<string, RoundStanding>) => (r: string) => m[r] ?? 'PENDING';

    it('everyone is in the first round', () => {
      expect(takesPart(rounds, standing({}), 'r1')).toEqual({ in: true });
    });

    it('later rounds need an advance from the last round that eliminates', () => {
      expect(takesPart(rounds, standing({}), 'r2')).toEqual({ in: false, reason: 'NOT_ADVANCED' });
      expect(takesPart(rounds, standing({ r1: 'ADVANCED' }), 'r2')).toEqual({ in: true });
      // r2 doesn't eliminate, so r3 still looks back to r1.
      expect(takesPart(rounds, standing({ r1: 'ADVANCED' }), 'r3')).toEqual({ in: true });
    });

    it('an eliminated team is out of every later round', () => {
      expect(takesPart(rounds, standing({ r1: 'ELIMINATED' }), 'r3')).toEqual({ in: false, reason: 'ELIMINATED' });
      expect(isEliminated(rounds, standing({ r3: 'ELIMINATED' }))).toBe(true);
      expect(teamStage({ cancelled: false, statementLockedAt: new Date(), eliminated: true })).toBe('ELIMINATED');
    });

    it('opening a round waits for every undecided team of earlier eliminating rounds', () => {
      const teams = [
        { id: 'a', standing: standing({ r1: 'ADVANCED' }) },
        { id: 'b', standing: standing({}) },
        { id: 'c', standing: standing({ r1: 'ELIMINATED' }) },
      ];
      expect(undecidedBefore(rounds, teams, 'r2')).toEqual([{ roundId: 'r1', teamIds: ['b'] }]);
      expect(undecidedBefore(rounds, teams, 'r1')).toEqual([]);
      // Team c was out before r3, so it doesn't count there; a is undecided in... r1 only.
      const decided = [
        { id: 'a', standing: standing({ r1: 'ADVANCED' }) },
        { id: 'c', standing: standing({ r1: 'ELIMINATED' }) },
      ];
      expect(undecidedBefore(rounds, decided, 'r3')).toEqual([]);
    });
  });

  it('judges with no themes take every team; text themes match everyone', () => {
    expect(judgeTakesTheme([], 't1')).toBe(true);
    expect(judgeTakesTheme(['t1'], 't1')).toBe(true);
    expect(judgeTakesTheme(['t2'], 't1')).toBe(false);
    expect(judgeTakesTheme(['t2'], null)).toBe(true);
  });

  it('estimates the wait as one slot per team ahead, plus the one in the slot', () => {
    expect(estimatedWaitMinutes(2, true, 10)).toBe(30);
    expect(estimatedWaitMinutes(0, false, 10)).toBe(0);
  });

  it('normalises judge phone numbers to E.164 (10 digits = India)', () => {
    expect(normalizeMobile('98765 43210')).toBe('+919876543210');
    expect(normalizeMobile('919876543210')).toBe('+919876543210');
    expect(normalizeMobile('+44 7700-900123')).toBe('+447700900123');
    expect(normalizeMobile('12345')).toBeNull();
    expect(normalizeMobile('abc')).toBeNull();
  });

  it.each([
    ['+91 98765 43210', '+919876543210'],
    ['9876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    [' 0 98765-43210 ', '+919876543210'],
    ['0091 98765 43210', '+919876543210'],
    ['00919876543210', '+919876543210'],
    ['001 (212) 555-0123', '+12125550123'],
    ['0', null],
    ['00', null],
    ['call me', null],
  ])('normalizeMobile reads trunk-0 and 00-prefixed numbers: %j → %j', (raw, expected) => {
    expect(normalizeMobile(raw)).toBe(expected);
  });

  it('makes a unique criterion key from its label', () => {
    expect(criterionKey('Innovation & Impact', new Set())).toBe('innovation-impact');
    expect(criterionKey('Innovation', new Set(['innovation', 'innovation-2']))).toBe('innovation-3');
    expect(criterionKey('!!!', new Set())).toBe('criterion');
  });
});
