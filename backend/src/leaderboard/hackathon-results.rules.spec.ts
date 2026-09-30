import { RoleCode } from '@prisma/client';
import { Action } from '../auth/authorization/actions';
import { CAPABILITIES } from '../auth/authorization/capabilities';
import {
  competitionRanks,
  csvCell,
  cumulativeTotal,
  evaluationTotal,
  finalRoundId,
  toCsv,
  topNSplit,
} from './hackathon.shared';

/** Scoring, results and winners (Phase 4): the pure rules and the permission split. */
describe('hackathon results rules', () => {
  it('ranks PER_ROUND on the latest round that was opened', () => {
    const rounds = [
      { id: 'r1', order: 1, status: 'CLOSED' as const },
      { id: 'r2', order: 2, status: 'ACTIVE' as const },
      { id: 'r3', order: 3, status: 'PENDING' as const },
    ];
    expect(finalRoundId(rounds)).toBe('r2');
    expect(finalRoundId([{ id: 'r1', order: 1, status: 'PENDING' }])).toBe('r1');
    expect(finalRoundId([])).toBeNull();
  });

  it('CUMULATIVE adds up only the rounds that count', () => {
    const scores = new Map([
      ['r1', 30.5],
      ['r2', 40],
      ['r3', 12],
    ]);
    expect(cumulativeTotal(scores, new Set(['r1', 'r2']))).toBe(70.5);
    expect(cumulativeTotal(scores, new Set())).toBe(0);
  });

  it('an evaluation is the weighted total of its marks', () => {
    const weights = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    expect(evaluationTotal([{ metricId: 'a', value: 7 }, { metricId: 'b', value: 4 }], weights)).toBe(15);
    expect(evaluationTotal([{ metricId: 'x', value: 9 }], weights)).toBe(0);
  });

  it('gives competition ranks and leaves unscored teams unranked', () => {
    const ranked = competitionRanks([
      { id: 'a', score: 10 },
      { id: 'b', score: null },
      { id: 'c', score: 12 },
      { id: 'd', score: 10 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['d', 2],
      ['b', null],
    ]);
  });

  describe('top N', () => {
    const teams = [
      { id: 'a', score: 20 },
      { id: 'b', score: 18 },
      { id: 'c', score: 18 },
      { id: 'd', score: 10 },
      { id: 'e', score: null },
    ];

    it('advances the best N and eliminates the rest', () => {
      expect(topNSplit(teams, 1)).toEqual({ advance: ['a'], eliminate: ['b', 'c', 'd', 'e'], tiedAtCut: 0 });
    });

    it('lets teams tied with the Nth through, and says how many', () => {
      const split = topNSplit(teams, 2);
      expect(split.advance.sort()).toEqual(['a', 'b', 'c']);
      expect(split.tiedAtCut).toBe(1);
    });

    it('never advances an unscored team', () => {
      expect(topNSplit(teams, 10).advance).not.toContain('e');
    });
  });

  it('CSV cells are quoted when needed and never run as formulas', () => {
    expect(csvCell('Team, "A"')).toBe('"Team, ""A"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-12.5')).toBe('-12.5');
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 'b'], [1, 2]])).toBe('﻿a,b\r\n1,2');
  });

  it('only Curators (and Space Admins, by inheritance) declare winners, not Co-Curators', () => {
    expect(CAPABILITIES[RoleCode.CURATOR]).toContain(Action.EVENT_DECLARE_HACKATHON_WINNERS);
    expect(CAPABILITIES[RoleCode.CO_CURATOR]).not.toContain(Action.EVENT_DECLARE_HACKATHON_WINNERS);
    expect(CAPABILITIES[RoleCode.CO_CURATOR]).toContain(Action.EVENT_MANAGE_LEADERBOARD);
  });
});
