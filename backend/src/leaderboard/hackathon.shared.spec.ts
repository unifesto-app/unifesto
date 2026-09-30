import {
  TEAM_CODE_PREFIX_RE,
  TEAM_CODE_RE,
  compareTeams,
  defaultTeamName,
  formatTeamCode,
  initialTeamName,
  planRoomAllocation,
  planTeamImport,
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
