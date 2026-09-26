import {
  EntrantInput,
  MetricDef,
  computeEntrantScore,
  rankEntrants,
} from './ranking';

const rubric: MetricDef[] = [
  { id: 'innovation', weight: 2, isPrimary: false },
  { id: 'execution', weight: 1, isPrimary: false },
];

const metricFields: MetricDef[] = [
  { id: 'points', weight: 1, isPrimary: true },
  { id: 'bonus', weight: 1, isPrimary: false },
];

describe('computeEntrantScore', () => {
  it('METRIC mode ranks by the primary metric only', () => {
    const e: EntrantInput = {
      entrantId: 'a',
      firstScoredAt: 0,
      cells: [
        { metricId: 'points', judgeUserId: null, value: 42 },
        { metricId: 'bonus', judgeUserId: null, value: 99 },
      ],
    };
    expect(computeEntrantScore(e, metricFields, 'METRIC')).toBe(42);
  });

  it('RUBRIC weights criteria then averages across judges', () => {
    // judge j1: 2*8 + 1*6 = 22 ; judge j2: 2*10 + 1*4 = 24 ; avg = 23
    const e: EntrantInput = {
      entrantId: 'a',
      firstScoredAt: 0,
      cells: [
        { metricId: 'innovation', judgeUserId: 'j1', value: 8 },
        { metricId: 'execution', judgeUserId: 'j1', value: 6 },
        { metricId: 'innovation', judgeUserId: 'j2', value: 10 },
        { metricId: 'execution', judgeUserId: 'j2', value: 4 },
      ],
    };
    expect(computeEntrantScore(e, rubric, 'RUBRIC')).toBe(23);
  });

  it('averages by judge count, so more judges does not inflate a score', () => {
    // Two teams with identical per-judge scores but different panel sizes rank equal.
    const twoJudges: EntrantInput = {
      entrantId: 'two',
      firstScoredAt: 0,
      cells: [
        { metricId: 'innovation', judgeUserId: 'j1', value: 5 },
        { metricId: 'innovation', judgeUserId: 'j2', value: 5 },
      ],
    };
    const threeJudges: EntrantInput = {
      entrantId: 'three',
      firstScoredAt: 0,
      cells: [
        { metricId: 'innovation', judgeUserId: 'j1', value: 5 },
        { metricId: 'innovation', judgeUserId: 'j2', value: 5 },
        { metricId: 'innovation', judgeUserId: 'j3', value: 5 },
      ],
    };
    expect(computeEntrantScore(twoJudges, rubric, 'RUBRIC')).toBe(
      computeEntrantScore(threeJudges, rubric, 'RUBRIC'),
    );
  });

  it('SPLIT PANELS: each entrant is averaged over only the judges who scored IT', () => {
    // Panel is split by entrant: j1 covers Team A, j2 covers Team B. Neither
    // team is penalised for the other's panel — each is averaged over its own
    // single judge, so the weighted single-judge total stands.
    const teamA: EntrantInput = {
      entrantId: 'A',
      firstScoredAt: 0,
      cells: [
        { metricId: 'innovation', judgeUserId: 'j1', value: 9 }, // 2*9 = 18
        { metricId: 'execution', judgeUserId: 'j1', value: 7 }, // 1*7 = 7 → 25
      ],
    };
    const teamB: EntrantInput = {
      entrantId: 'B',
      firstScoredAt: 0,
      cells: [
        { metricId: 'innovation', judgeUserId: 'j2', value: 6 }, // 2*6 = 12
        { metricId: 'execution', judgeUserId: 'j2', value: 5 }, // 1*5 = 5 → 17
      ],
    };
    expect(computeEntrantScore(teamA, rubric, 'RUBRIC')).toBe(25);
    expect(computeEntrantScore(teamB, rubric, 'RUBRIC')).toBe(17);
  });

  it('DEFAULT POLICY: a skipped criterion counts as 0 for that judge', () => {
    // j1 only scored innovation (2*7=14); execution missing => 0. Single judge => 14.
    const e: EntrantInput = {
      entrantId: 'a',
      firstScoredAt: 0,
      cells: [{ metricId: 'innovation', judgeUserId: 'j1', value: 7 }],
    };
    expect(computeEntrantScore(e, rubric, 'RUBRIC')).toBe(14);
  });
});

describe('rankEntrants', () => {
  it('assigns standard competition ranks (1,2,2,4) and breaks ties by earliest', () => {
    const entrants: EntrantInput[] = [
      { entrantId: 'top', firstScoredAt: 100, cells: [{ metricId: 'points', judgeUserId: null, value: 90 }] },
      { entrantId: 'mid-late', firstScoredAt: 200, cells: [{ metricId: 'points', judgeUserId: null, value: 50 }] },
      { entrantId: 'mid-early', firstScoredAt: 100, cells: [{ metricId: 'points', judgeUserId: null, value: 50 }] },
      { entrantId: 'low', firstScoredAt: 100, cells: [{ metricId: 'points', judgeUserId: null, value: 10 }] },
    ];
    const ranked = rankEntrants(entrants, metricFields, {
      mode: 'METRIC',
      tieBreak: 'EARLIEST_SUBMISSION',
    });
    const byId = Object.fromEntries(ranked.map((r) => [r.entrantId, r.rank]));
    expect(byId['top']).toBe(1);
    // Tie at 50: earlier submission wins rank 2, later shares the tie value only if equal.
    expect(byId['mid-early']).toBe(2);
    expect(byId['mid-late']).toBe(3);
    expect(byId['low']).toBe(4);
  });
});
