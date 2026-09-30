import { LeaderboardService } from './leaderboard.service';
import {
  cleanLinks,
  evaluationsRequired,
  finalRoundId,
  readLinks,
  roundConfigError,
  submissionOpen,
} from './hackathon.shared';

/** Mentoring rounds, mentors and project links (Phase 5). */
describe('hackathon mentoring + project links', () => {
  describe('rounds', () => {
    it('a mentoring round allows N sessions, whatever its judging mode', () => {
      expect(evaluationsRequired({ kind: 'MENTORING', judgingMode: 'SINGLE', requiredEvaluations: 3 })).toBe(3);
      expect(evaluationsRequired({ kind: 'EVALUATION', judgingMode: 'SINGLE', requiredEvaluations: 3 })).toBe(1);
    });

    it('mentoring rounds use single mentors (no panels) and 1–10 sessions', () => {
      expect(roundConfigError({ kind: 'MENTORING', judgingMode: 'PANEL', requiredEvaluations: 1 })).toMatch(/not panels/);
      expect(roundConfigError({ kind: 'MENTORING', judgingMode: 'SINGLE', requiredEvaluations: 1 })).toBeNull();
      expect(roundConfigError({ kind: 'MENTORING', judgingMode: 'SINGLE', requiredEvaluations: 11 })).toMatch(/between 1 and 10/);
    });

    it('a mentoring round never decides the PER_ROUND ranking', () => {
      expect(
        finalRoundId([
          { id: 'r1', order: 1, status: 'CLOSED', kind: 'EVALUATION' },
          { id: 'm', order: 2, status: 'ACTIVE', kind: 'MENTORING' },
        ]),
      ).toBe('r1');
    });
  });

  describe('project links', () => {
    it('keeps http(s) links, labels them from the site, drops blanks and duplicates', () => {
      expect(
        cleanLinks([
          { label: 'Repo', url: 'https://github.com/a/b' },
          { label: '', url: 'https://www.figma.com/file/x' },
          { label: '', url: '' },
          { label: 'Again', url: 'https://github.com/a/b' },
        ]),
      ).toEqual({
        links: [
          { label: 'Repo', url: 'https://github.com/a/b' },
          { label: 'figma.com', url: 'https://www.figma.com/file/x' },
        ],
      });
    });

    it('refuses non-web links, missing URLs and more than 10', () => {
      expect(cleanLinks([{ url: 'javascript:alert(1)' }])).toEqual({ error: expect.stringMatching(/https/) });
      expect(cleanLinks([{ label: 'Demo', url: '' }])).toEqual({ error: expect.stringMatching(/Demo/) });
      expect(cleanLinks([{ url: 'not a link' }])).toEqual({ error: expect.stringMatching(/isn't a link/) });
      expect(cleanLinks(Array.from({ length: 11 }, (_, i) => ({ url: `https://x.dev/${i}` })))).toEqual({ error: expect.stringMatching(/at most 10/) });
    });

    it('links can change until the cut-off, and never once the round closed', () => {
      const now = new Date('2026-10-01T10:00:00Z');
      expect(submissionOpen({ status: 'ACTIVE', submissionsCloseAt: null }, now)).toBe(true);
      expect(submissionOpen({ status: 'PENDING', submissionsCloseAt: new Date('2026-10-01T11:00:00Z') }, now)).toBe(true);
      expect(submissionOpen({ status: 'ACTIVE', submissionsCloseAt: new Date('2026-10-01T10:00:00Z') }, now)).toBe(false);
      expect(submissionOpen({ status: 'CLOSED', submissionsCloseAt: null }, now)).toBe(false);
    });

    it('reads stored links defensively', () => {
      expect(readLinks(null)).toEqual([]);
      expect(readLinks([{ url: 'https://a.dev' }, 'junk', { label: 'x' }])).toEqual([{ label: 'https://a.dev', url: 'https://a.dev' }]);
    });
  });

  describe('mentor feedback', () => {
    const build = (roundKind: 'EVALUATION' | 'MENTORING', coveringRows: number) => {
      const upsert = jest.fn().mockResolvedValue({ submittedAt: new Date(), reopenedAt: null, requestId: 'req-1' });
      const prisma: any = {
        leaderboardEntrant: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'team-1',
            cancelledAt: null,
            statementLockedAt: new Date(),
            leaderboard: { id: 'board-1', eventId: 'event-1', mode: 'RUBRIC', metrics: [], isHackathon: true, enabled: true },
          }),
        },
        leaderboardRound: { findFirst: jest.fn().mockResolvedValue({ id: 'round-1', status: 'ACTIVE', kind: roundKind }) },
        leaderboardPanelist: {
          findMany: jest.fn().mockResolvedValue([{ kind: 'MENTOR', roundId: null, entrantId: null }]),
          count: jest.fn().mockResolvedValue(coveringRows),
        },
        leaderboardJudgment: { upsert, findUnique: jest.fn().mockResolvedValue(null) },
        hackathonEvalRequest: {
          findFirst: jest.fn().mockResolvedValue({ id: 'req-1', panelId: null }),
          count: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        leaderboard: { findUnique: jest.fn().mockResolvedValue(null) },
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
      };
      const svc = new LeaderboardService(
        prisma,
        {} as any,
        { assertCan: jest.fn(), can: jest.fn() } as any,
        { broadcast: jest.fn(), hackathonChanged: jest.fn() } as any,
        { emit: jest.fn() } as any,
      );
      return { svc, upsert };
    };

    it('a mentor submits written feedback and it completes the session', async () => {
      const { svc, upsert } = build('MENTORING', 1);
      await expect(svc.submitJudgment('mentor-1', 'team-1', { roundId: 'round-1', overallReview: 'Scope it down', submit: true })).resolves.toMatchObject({
        ok: true,
        slotCompleted: true,
      });
      expect(upsert.mock.calls[0][0].create.kind).toBe('MENTOR');
    });

    it('mentors never give marks', async () => {
      const { svc } = build('MENTORING', 1);
      await expect(
        svc.submitJudgment('mentor-1', 'team-1', { roundId: 'round-1', scores: [{ metricId: 'm', value: 5 }] }),
      ).rejects.toThrow(/not marks/);
    });

    it('a mentor can’t submit empty feedback', async () => {
      const { svc } = build('MENTORING', 1);
      await expect(svc.submitJudgment('mentor-1', 'team-1', { roundId: 'round-1', overallReview: '  ', submit: true })).rejects.toThrow(
        /Write your feedback/,
      );
    });

    it('only mentors act in a mentoring round (a judge is refused)', async () => {
      const { svc } = build('MENTORING', 0);
      await expect(svc.submitJudgment('judge-1', 'team-1', { roundId: 'round-1', overallReview: 'x', submit: true })).rejects.toThrow(
        /Only mentors/,
      );
    });
  });
});
