import {
  TEAM_CODE_PREFIX_RE,
  TEAM_CODE_RE,
  STATEMENT_CODE_RE,
  compareTeams,
  deadlineReminderDue,
  defaultTeamName,
  formatTeamCode,
  initialTeamName,
  nextStatementCode,
  placesLeft,
  planRoomAllocation,
  planTeamImport,
  resolveTheme,
  statementBlock,
  teamStage,
} from './hackathon.shared';

describe('hackathon rules', () => {
  describe('formatTeamCode', () => {
    it('pads the number to the configured digits', () => {
      expect(formatTeamCode('HACK25-', 3, 7)).toBe('HACK25-007');
      expect(formatTeamCode('T', 1, 7)).toBe('T7');
    });

    it('never cuts a number wider than the digits', () => {
      expect(formatTeamCode('HACK-', 2, 123)).toBe('HACK-123');
    });
  });

  describe('code patterns', () => {
    it.each(['HACK25-', 'T', 'SIH/2025/', 'a.b_c'])('accepts prefix %s', (p) => {
      expect(TEAM_CODE_PREFIX_RE.test(p)).toBe(true);
    });

    it.each(['', '-HACK', 'HACK 25', 'HACK#', 'X'.repeat(21)])('rejects prefix %s', (p) => {
      expect(TEAM_CODE_PREFIX_RE.test(p)).toBe(false);
    });

    it('accepts hand-typed codes with spaces and #, not leading symbols', () => {
      expect(TEAM_CODE_RE.test('Team #12')).toBe(true);
      expect(TEAM_CODE_RE.test(' 12')).toBe(false);
      expect(TEAM_CODE_RE.test('#12')).toBe(false);
    });
  });

  describe('team names', () => {
    it('uses the linked per-group answer when there is one', () => {
      expect(
        initialTeamName({
          formResponses: { f1: '  Null   Pointers ' },
          teamNameFieldId: 'f1',
          leadName: 'Asha',
          teamCode: 'H-001',
        }),
      ).toEqual({ name: 'Null Pointers', source: 'FORM' });
    });

    it('falls back to the lead’s name when the answer is blank or not text', () => {
      for (const answer of ['   ', 42, null, ['x']]) {
        expect(
          initialTeamName({ formResponses: { f1: answer }, teamNameFieldId: 'f1', leadName: 'Asha', teamCode: 'H-001' }),
        ).toEqual({ name: "Asha's team", source: 'DEFAULT' });
      }
    });

    it('falls back to the Team ID when there is no lead name', () => {
      expect(defaultTeamName(null, 'H-004')).toBe('Team H-004');
      expect(defaultTeamName('  ', 'H-004')).toBe('Team H-004');
    });
  });

  describe('planTeamImport', () => {
    const base = {
      linkedRegistrationIds: new Set<string>(),
      usedCodes: new Set<string>(),
      prefix: 'H-',
      digits: 3,
      next: 1,
      teamNameFieldId: null,
    };
    const reg = (id: string, leadName = id) => ({ registrationId: id, leadName, formResponses: {} });

    it('numbers teams in order from `next`', () => {
      const plan = planTeamImport({ ...base, candidates: [reg('a'), reg('b')] });
      expect(plan.teams.map((t) => [t.registrationId, t.teamCode, t.teamSeq])).toEqual([
        ['a', 'H-001', 1],
        ['b', 'H-002', 2],
      ]);
      expect(plan.next).toBe(3);
    });

    it('skips registrations that already have a team (re-import is safe)', () => {
      const plan = planTeamImport({
        ...base,
        next: 3,
        linkedRegistrationIds: new Set(['a', 'b']),
        usedCodes: new Set(['H-001', 'H-002']),
        candidates: [reg('a'), reg('b'), reg('c')],
      });
      expect(plan.skipped).toBe(2);
      expect(plan.teams.map((t) => t.teamCode)).toEqual(['H-003']);
    });

    it('never reuses a code, even one a cancelled team or a curator holds', () => {
      // H-002 was typed by hand on another team; H-001 belongs to a cancelled team.
      const plan = planTeamImport({
        ...base,
        next: 1,
        usedCodes: new Set(['H-001', 'H-002']),
        candidates: [reg('x'), reg('y')],
      });
      expect(plan.teams.map((t) => t.teamCode)).toEqual(['H-003', 'H-004']);
      expect(plan.next).toBe(5);
    });

    it('leaves the counter alone when nothing is imported', () => {
      const plan = planTeamImport({ ...base, next: 9, candidates: [] });
      expect(plan).toEqual({ teams: [], skipped: 0, next: 9 });
    });
  });

  describe('planRoomAllocation', () => {
    it('fills free places room by room, in order', () => {
      const plan = planRoomAllocation(
        [
          { id: 'r1', capacity: 2, occupied: 1 },
          { id: 'r2', capacity: 2, occupied: 0 },
        ],
        ['t1', 't2', 't3'],
      );
      expect(plan.assignments).toEqual([
        { teamId: 't1', roomId: 'r1' },
        { teamId: 't2', roomId: 'r2' },
        { teamId: 't3', roomId: 'r2' },
      ]);
      expect(plan.unplaced).toEqual([]);
    });

    it('reports teams that do not fit, and ignores over-full rooms', () => {
      const plan = planRoomAllocation([{ id: 'r1', capacity: 1, occupied: 3 }], ['t1']);
      expect(plan.assignments).toEqual([]);
      expect(plan.unplaced).toEqual(['t1']);
    });
  });

  describe('teamStage', () => {
    it('is CANCELLED first, then waits for a problem statement', () => {
      expect(teamStage({ cancelled: true, statementLockedAt: new Date() })).toBe('CANCELLED');
      expect(teamStage({ cancelled: false })).toBe('NEEDS_PS');
      expect(teamStage({ cancelled: false, statementLockedAt: new Date() })).toBe('ACTIVE');
      expect(teamStage({ cancelled: false, statementLockedAt: new Date(), eliminated: true })).toBe('ELIMINATED');
    });
  });

  describe('compareTeams', () => {
    it('orders by import number, hand-typed codes last', () => {
      const teams = [
        { teamSeq: null, teamCode: 'Z-1' },
        { teamSeq: 10, teamCode: 'H-010' },
        { teamSeq: 2, teamCode: 'H-002' },
      ];
      expect(teams.sort(compareTeams).map((t) => t.teamCode)).toEqual(['H-002', 'H-010', 'Z-1']);
    });
  });
});

describe('problem statement rules', () => {
  const NOW = new Date('2026-10-04T10:00:00Z');
  const LATER = new Date('2026-10-04T12:00:00Z');
  const EARLIER = new Date('2026-10-04T09:00:00Z');

  describe('teamStage', () => {
    it('is NEEDS_PS until the statement is locked, then ACTIVE', () => {
      expect(teamStage({ cancelled: false })).toBe('NEEDS_PS');
      expect(teamStage({ cancelled: false, statementLockedAt: NOW })).toBe('ACTIVE');
    });

    it('cancelled wins over a locked statement', () => {
      expect(teamStage({ cancelled: true, statementLockedAt: NOW })).toBe('CANCELLED');
    });
  });

  describe('statementBlock', () => {
    const open = { psDeadline: null, lockedAt: null, now: NOW };

    it('lets teams choose in TEAM_WRITES and TEAM_PICKS', () => {
      expect(statementBlock({ ...open, psMode: 'TEAM_WRITES' })).toBeNull();
      expect(statementBlock({ ...open, psMode: 'TEAM_PICKS' })).toBeNull();
    });

    it('is not open until the curator picks a mode', () => {
      expect(statementBlock({ ...open, psMode: null })).toBe('NOT_OPEN');
    });

    it('leaves it to the curator in CURATOR_ASSIGNS', () => {
      expect(statementBlock({ ...open, psMode: 'CURATOR_ASSIGNS' })).toBe('CURATOR_ASSIGNS');
    });

    it('closes at the deadline, not before', () => {
      expect(statementBlock({ ...open, psMode: 'TEAM_PICKS', psDeadline: LATER })).toBeNull();
      expect(statementBlock({ ...open, psMode: 'TEAM_PICKS', psDeadline: NOW })).toBe('DEADLINE_PASSED');
      expect(statementBlock({ ...open, psMode: 'TEAM_PICKS', psDeadline: EARLIER })).toBe('DEADLINE_PASSED');
    });

    it('a locked statement stays locked whatever the mode', () => {
      expect(statementBlock({ ...open, psMode: 'TEAM_PICKS', lockedAt: EARLIER })).toBe('LOCKED');
      expect(statementBlock({ ...open, psMode: null, lockedAt: EARLIER })).toBe('LOCKED');
    });
  });

  describe('resolveTheme', () => {
    const themeIds = new Set(['t-health', 't-fin']);

    it("takes the statement's own theme and ignores what was sent", () => {
      expect(
        resolveTheme({ themeMode: 'LIST', themeIds, statementThemeId: 't-fin', themeId: 't-health' }),
      ).toEqual({ themeId: 't-fin', themeText: null });
    });

    it('needs a theme from the list when there is one', () => {
      expect(resolveTheme({ themeMode: 'LIST', themeIds, statementThemeId: null })).toEqual({ error: 'Pick a theme.' });
      expect(resolveTheme({ themeMode: 'LIST', themeIds, statementThemeId: null, themeId: 't-health' })).toEqual({
        themeId: 't-health',
        themeText: null,
      });
    });

    it('rejects a theme that is not on the list', () => {
      expect(resolveTheme({ themeMode: 'LIST', themeIds, statementThemeId: null, themeId: 't-gone' })).toHaveProperty('error');
    });

    it('needs no theme when the list is empty', () => {
      expect(resolveTheme({ themeMode: 'LIST', themeIds: new Set(), statementThemeId: null })).toEqual({
        themeId: null,
        themeText: null,
      });
    });

    it('takes short free text in TEXT mode', () => {
      expect(resolveTheme({ themeMode: 'TEXT', themeIds, statementThemeId: null, themeText: '  Health   Tech ' })).toEqual({
        themeId: null,
        themeText: 'Health Tech',
      });
      expect(resolveTheme({ themeMode: 'TEXT', themeIds, statementThemeId: null, themeText: '  ' })).toHaveProperty('error');
      expect(
        resolveTheme({ themeMode: 'TEXT', themeIds, statementThemeId: null, themeText: 'x'.repeat(80) }),
      ).toEqual({ themeId: null, themeText: 'x'.repeat(60) });
    });
  });

  describe('nextStatementCode', () => {
    it('starts at PS-01 and follows the highest number', () => {
      expect(nextStatementCode([])).toBe('PS-01');
      expect(nextStatementCode(['PS-01', 'PS-07', 'AI-1'])).toBe('PS-08');
      expect(nextStatementCode(['ps-02'])).toBe('PS-03');
    });

    it('produces codes that pass the code rule', () => {
      expect(STATEMENT_CODE_RE.test(nextStatementCode(['PS-99']))).toBe(true);
      expect(STATEMENT_CODE_RE.test('PS 1')).toBe(false);
      expect(STATEMENT_CODE_RE.test('-PS1')).toBe(false);
    });
  });

  describe('placesLeft', () => {
    it('is null without a limit and never negative', () => {
      expect(placesLeft(null, 5)).toBeNull();
      expect(placesLeft(3, 1)).toBe(2);
      expect(placesLeft(3, 4)).toBe(0);
    });
  });

  describe('deadlineReminderDue', () => {
    const inHalfHour = new Date(NOW.getTime() + 30 * 60 * 1000);

    it('fires within the last hour before the deadline, once per deadline', () => {
      expect(deadlineReminderDue({ psMode: 'TEAM_PICKS', psDeadline: inHalfHour, remindedFor: null, now: NOW })).toBe(true);
      expect(
        deadlineReminderDue({ psMode: 'TEAM_PICKS', psDeadline: inHalfHour, remindedFor: inHalfHour, now: NOW }),
      ).toBe(false);
    });

    it('re-arms when the deadline moves', () => {
      expect(
        deadlineReminderDue({ psMode: 'TEAM_WRITES', psDeadline: inHalfHour, remindedFor: EARLIER, now: NOW }),
      ).toBe(true);
    });

    it('stays quiet too early, after the deadline, or when the curator assigns', () => {
      expect(deadlineReminderDue({ psMode: 'TEAM_PICKS', psDeadline: LATER, remindedFor: null, now: NOW })).toBe(false);
      expect(deadlineReminderDue({ psMode: 'TEAM_PICKS', psDeadline: EARLIER, remindedFor: null, now: NOW })).toBe(false);
      expect(
        deadlineReminderDue({ psMode: 'CURATOR_ASSIGNS', psDeadline: inHalfHour, remindedFor: null, now: NOW }),
      ).toBe(false);
    });
  });
});
