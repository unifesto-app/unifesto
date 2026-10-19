import { ForbiddenException } from '@nestjs/common';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PollsService } from './polls.service';
import { ProjectorService, RESULTS_LINGER_MS, pickMode } from './projector.service';
import { QuestionsService } from './questions.service';
import { QuizzesService } from './quizzes.service';

// L4: the display link opens one event read-only until regenerated, and the
// snapshot carries no attendee PII.
describe('ProjectorService', () => {
  const EVENT = '11111111-1111-1111-1111-111111111111';
  const OTHER = '22222222-2222-2222-2222-222222222222';
  const now = new Date('2026-11-06T10:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  const build = (opts: { operator?: boolean } = {}) => {
    const events: Record<string, { displayToken: string | null }> = {
      [EVENT]: { displayToken: null },
      [OTHER]: { displayToken: null },
    };
    const person = { id: 'u1', fullName: 'Asha Verma', username: 'asha', email: 'asha@x.in', phone: '+919800000000' };
    const prisma = {
      event: {
        // Stands in for WHERE id = $1 AND display_token = $2.
        count: jest.fn(async ({ where }: { where: { id: string; displayToken: string } }) =>
          events[where.id]?.displayToken === where.displayToken ? 1 : 0,
        ),
        findUnique: jest.fn(async ({ where, select }: { where: { id: string }; select: Record<string, unknown> }) => {
          if (!events[where.id]) return null;
          if (select.displayToken) return { displayToken: events[where.id].displayToken };
          return { title: 'Fest', whiteLabelEnabled: false, brandColor: null, space: { subscription: null, name: 'Club' } };
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { id: string; displayToken?: null }; data: { displayToken: string } }) => {
          const e = events[where.id];
          if (!e || (where.displayToken === null && e.displayToken !== null)) return { count: 0 };
          e.displayToken = data.displayToken;
          return { count: 1 };
        }),
      },
      poll: {
        findFirst: jest.fn(async ({ where }: { where: { status: string } }) =>
          where.status === 'LIVE'
            ? { id: 'p1', question: 'Best talk?', options: ['A', 'B'], status: 'LIVE', resultsVisibility: 'AFTER_VOTE', launchedAt: ago(60_000), closedAt: null }
            : null,
        ),
      },
      pollVote: { groupBy: jest.fn().mockResolvedValue([{ pollId: 'p1', optionIndex: 1, _count: { _all: 4 } }]) },
      question: {
        // Over-returns the asker on purpose: the display must not pass it on.
        findMany: jest.fn().mockResolvedValue([
          { id: 'q1', text: 'Slides?', status: 'APPROVED', pinned: true, createdAt: ago(1000), agenda: null, _count: { votes: 3 }, userId: 'u1', user: person },
        ]),
      },
      quiz: {
        findFirst: jest.fn(async ({ where }: { where: { status: string } }) =>
          where.status === 'ENDED' ? { id: 'z1', title: 'Trivia', status: 'ENDED', currentIndex: 1, startedAt: ago(3_600_000), endedAt: ago(3_000_000) } : null,
        ),
      },
      quizQuestion: { count: jest.fn().mockResolvedValue(2), findFirst: jest.fn() },
      quizAnswer: { groupBy: jest.fn().mockResolvedValue([{ userId: 'u1', _sum: { points: 150 } }]) },
      user: { findMany: jest.fn().mockResolvedValue([person]) },
    };
    const authz = { can: jest.fn().mockResolvedValue(!!opts.operator) };
    const gateway = { engagementChanged: jest.fn(), dropDisplays: jest.fn() };
    const planConfig = { getEffectiveLimits: jest.fn() };
    const svc = new ProjectorService(
      prisma as never,
      authz as never,
      planConfig as never,
      gateway as never,
      new PollsService(prisma as never, authz as never, gateway as never),
      new QuestionsService(prisma as never, authz as never, gateway as never),
      new QuizzesService(prisma as never, authz as never, gateway as never),
    );
    return { svc, prisma, authz, gateway };
  };

  describe('display link', () => {
    it('opens its own event with a valid token', async () => {
      const { svc } = build();
      const { token } = await svc.getToken(EVENT);
      expect(token.length).toBeGreaterThanOrEqual(32);
      await expect(svc.snapshot(EVENT, token, undefined, now)).resolves.toMatchObject({ event: { title: 'Fest' } });
    });

    it('hands out the same token until regenerated', async () => {
      const { svc } = build();
      const a = await svc.getToken(EVENT);
      await expect(svc.getToken(EVENT)).resolves.toEqual(a);
    });

    it('refuses the old token once regenerated, and drops screens on it', async () => {
      const { svc, gateway } = build();
      const old = (await svc.getToken(EVENT)).token;
      const fresh = (await svc.regenerateToken(EVENT)).token;
      expect(fresh).not.toBe(old);
      expect(gateway.dropDisplays).toHaveBeenCalledWith(EVENT);
      await expect(svc.assertCanView(EVENT, old, undefined)).rejects.toThrow(ForbiddenException);
      await expect(svc.assertCanView(EVENT, fresh, undefined)).resolves.toBeUndefined();
    });

    it('never opens another event', async () => {
      const { svc } = build();
      const mine = (await svc.getToken(EVENT)).token;
      await svc.getToken(OTHER);
      await expect(svc.assertCanView(OTHER, mine, undefined)).rejects.toThrow(ForbiddenException);
    });

    it('refuses an empty token even before any link exists', async () => {
      const { svc } = build({ operator: true });
      await expect(svc.assertCanView(EVENT, '', 'u9')).rejects.toThrow(ForbiddenException);
    });

    it('without a token, needs an operator who can run the event', async () => {
      await expect(build().svc.assertCanView(EVENT, undefined, 'u9')).rejects.toThrow(ForbiddenException);
      await expect(build().svc.assertCanView(EVENT, undefined, undefined)).rejects.toThrow(ForbiddenException);
      const { svc, authz } = build({ operator: true });
      await expect(svc.assertCanView(EVENT, undefined, 'u9')).resolves.toBeUndefined();
      expect(authz.can).toHaveBeenCalledWith({ id: 'u9' }, 'event:edit', { eventId: EVENT });
    });
  });

  it('keeps attendee PII out of the snapshot', async () => {
    const { svc, prisma } = build();
    const { token } = await svc.getToken(EVENT);
    const snap = await svc.snapshot(EVENT, token, undefined, now);
    const json = JSON.stringify(snap);
    for (const pii of ['asha@x.in', '+919800000000', 'Verma', '"u1"', 'userId', 'email', 'phone']) {
      expect(json).not.toContain(pii);
    }
    // The Q&A wall never even selects the asker.
    expect(prisma.question.findMany.mock.calls[0][0].select).not.toHaveProperty('user');
    expect(snap.questions).toEqual([expect.objectContaining({ text: 'Slides?', votes: 3, pinned: true })]);
    expect(snap.quiz?.leaderboard.top).toEqual([{ rank: 1, name: 'Asha V.', score: 150 }]);
    expect(snap.poll).toMatchObject({ totalVotes: 4, results: [0, 4] });
    expect(snap.mode).toBe('poll');
  });

  describe('pickMode', () => {
    it('shows whatever was started or finished last', () => {
      expect(pickMode([], now)).toBe('qa');
      expect(
        pickMode([
          { mode: 'poll', live: true, at: ago(60_000) },
          { mode: 'quiz', live: true, at: ago(10_000) },
        ], now),
      ).toBe('quiz');
    });

    it('lets a finished result linger, then falls back to the Q&A wall', () => {
      expect(pickMode([{ mode: 'poll', live: false, at: ago(RESULTS_LINGER_MS - 1000) }], now)).toBe('poll');
      expect(pickMode([{ mode: 'poll', live: false, at: ago(RESULTS_LINGER_MS + 1000) }], now)).toBe('qa');
    });
  });
});

describe('LeaderboardGateway display join', () => {
  const build = (token: string | null) => {
    const prisma = {
      event: {
        count: jest.fn(async ({ where }: { where: { id: string; displayToken: string } }) =>
          where.id === 'e1' && token !== null && where.displayToken === token ? 1 : 0,
        ),
      },
    };
    const authz = { can: jest.fn().mockResolvedValue(false) };
    const gw = new LeaderboardGateway({} as never, {} as never, {} as never, prisma as never, authz as never);
    const client = { userId: null, data: {} as Record<string, unknown>, join: jest.fn() };
    return { gw, client };
  };
  const TOKEN = 'a'.repeat(32);

  it('joins the room with the event’s current token, no session needed', async () => {
    const { gw, client } = build(TOKEN);
    await expect(gw.onEngagementSubscribe(client as never, { eventId: 'e1', displayToken: TOKEN })).resolves.toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('eng:e1');
    expect(client.data.displayEventId).toBe('e1');
  });

  it('refuses a stale or foreign token', async () => {
    const { gw, client } = build(TOKEN);
    await expect(gw.onEngagementSubscribe(client as never, { eventId: 'e1', displayToken: 'b'.repeat(32) })).resolves.toEqual({ error: 'not_authorized' });
    await expect(gw.onEngagementSubscribe(client as never, { eventId: 'e2', displayToken: TOKEN })).resolves.toEqual({ error: 'not_authorized' });
    expect(client.join).not.toHaveBeenCalled();
  });

  it('drops only display-link sockets for that event', async () => {
    const { gw } = build(TOKEN);
    const display = { data: { displayEventId: 'e1' }, disconnect: jest.fn() };
    const operator = { data: {}, disconnect: jest.fn() };
    gw.server = { in: () => ({ fetchSockets: async () => [display, operator] }) } as never;
    await gw.dropDisplays('e1');
    expect(display.disconnect).toHaveBeenCalledWith(true);
    expect(operator.disconnect).not.toHaveBeenCalled();
  });
});
