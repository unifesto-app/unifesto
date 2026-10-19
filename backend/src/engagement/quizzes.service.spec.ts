import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GRACE_MS,
  LEAD_IN_MS,
  isClosed,
  questionWindow,
  rankPlayers,
  scoreAnswer,
} from './quiz.scoring';
import { QuizzesService, boardName } from './quizzes.service';

// L3: answer once, the server's clock, scoring, ties, and secrecy before close.
describe('QuizzesService', () => {
  const T0 = new Date('2026-11-20T10:00:00.000Z');
  const at = (ms: number) => new Date(T0.getTime() + ms);

  /** Question 0 of a live quiz, opened at T0 for 20 s, right answer = option 1. */
  const openQuestion = (over: object = {}) => ({
    id: 'q1',
    quizId: 'z1',
    position: 0,
    prompt: 'Closest planet to the sun?',
    options: ['Venus', 'Mercury', 'Mars'],
    correctIndexes: [1],
    timeLimitSec: 20,
    points: 100,
    openedAt: T0,
    closesAt: at(20_000),
    quiz: { status: 'LIVE', currentIndex: 0, speedBonus: true },
    ...over,
  });

  const build = (
    opts: { attending?: boolean; operator?: boolean; question?: object } = {},
  ) => {
    const answers: Record<string, unknown>[] = [];
    const question = openQuestion(opts.question);
    const prisma = {
      eventRegistration: {
        count: jest.fn().mockResolvedValue(opts.attending === false ? 0 : 1),
      },
      groupSeat: { count: jest.fn().mockResolvedValue(0) },
      quiz: {
        findFirst: jest.fn(async ({ where }: { where: { status?: string } }) =>
          where.status === 'LIVE'
            ? {
                id: 'z1',
                title: 'Trivia',
                status: 'LIVE',
                speedBonus: true,
                currentIndex: 0,
              }
            : null,
        ),
      },
      quizQuestion: {
        findFirst: jest.fn().mockResolvedValue(question),
        count: jest.fn().mockResolvedValue(3),
      },
      quizAnswer: {
        // Stands in for the unique (question_id, user_id) index.
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (
            answers.some(
              (a) =>
                a.questionId === data.questionId && a.userId === data.userId,
            )
          ) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed',
              {
                code: 'P2002',
                clientVersion: 'test',
              },
            );
          }
          answers.push(data);
          return data;
        }),
        findUnique: jest.fn(async () => answers[0] ?? null),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const authz = { can: jest.fn().mockResolvedValue(!!opts.operator) };
    const gateway = { engagementChanged: jest.fn() };
    const svc = new QuizzesService(
      prisma as never,
      authz as never,
      gateway as never,
    );
    return { svc, prisma, answers };
  };

  describe('answer', () => {
    it('takes one answer per person; the second is a conflict', async () => {
      const { svc, answers } = build();
      await svc.answer('e1', 'z1', 'u1', 'q1', 1, at(2000));
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 0, at(3000)),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(answers).toHaveLength(1);
    });

    it('scores on the server clock, never a client time', async () => {
      const { svc, answers } = build();
      await svc.answer('e1', 'z1', 'u1', 'q1', 1, at(5000));
      expect(answers[0]).toMatchObject({
        userId: 'u1',
        optionIndex: 1,
        correct: true,
        elapsedMs: 5000,
        points: 138,
      });
    });

    it('rejects an answer after the deadline and grace', async () => {
      const { svc, answers } = build();
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 1, at(20_000 + GRACE_MS)),
      ).rejects.toThrow('Time’s up');
      expect(answers).toHaveLength(0);
    });

    it('still takes a tap that was in flight at the deadline', async () => {
      const { svc, answers } = build();
      await svc.answer('e1', 'z1', 'u1', 'q1', 1, at(20_000 + GRACE_MS - 1));
      expect(answers[0]).toMatchObject({ correct: true, points: 100 }); // no time left = no bonus
    });

    it('rejects an answer during the lead-in, before answers open', async () => {
      const { svc } = build();
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 1, at(-1)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a stale screen answering a question the quiz has moved past', async () => {
      const { svc } = build({
        question: {
          quiz: { status: 'LIVE', currentIndex: 1, speedBonus: true },
        },
      });
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 1, at(1000)),
      ).rejects.toThrow('This question is not open');
    });

    it('rejects answers once the quiz has ended', async () => {
      const { svc } = build({
        question: {
          quiz: { status: 'ENDED', currentIndex: 0, speedBonus: true },
        },
      });
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 1, at(1000)),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses someone not attending, even an operator', async () => {
      const { svc, answers } = build({ attending: false, operator: true });
      await expect(
        svc.answer('e1', 'z1', 'u1', 'q1', 1, at(1000)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(answers).toHaveLength(0);
    });
  });

  describe('secrecy before close', () => {
    it('keeps the right option and the verdict out of the feed while the question is open', async () => {
      const { svc } = build();
      const res = await svc.answer('e1', 'z1', 'u1', 'q1', 1, at(4000));
      const q = res.quiz!.question!;
      expect(q.closed).toBe(false);
      expect(q.correctIndexes).toBeNull();
      expect(q.myAnswer).toEqual({
        optionIndex: 1,
        correct: null,
        points: null,
      });
      expect(JSON.stringify(res)).not.toMatch(/correctIndexes":\[/);
    });

    it('counts only closed questions on the board while one is open', async () => {
      const { svc, prisma } = build();
      await svc.feed('e1', 'u1', at(4000));
      expect(prisma.quizAnswer.groupBy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { quizId: 'z1', question: { position: { lt: 0 } } },
        }),
      );
    });

    it('reveals the right option, the verdict and the board once it closes', async () => {
      const { svc, prisma } = build();
      await svc.answer('e1', 'z1', 'u1', 'q1', 1, at(4000));
      const res = await svc.feed('e1', 'u1', at(20_000 + GRACE_MS));
      const q = res.quiz!.question!;
      expect(q.closed).toBe(true);
      expect(q.correctIndexes).toEqual([1]);
      expect(q.myAnswer).toMatchObject({ optionIndex: 1, correct: true });
      expect(prisma.quizAnswer.groupBy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { quizId: 'z1', question: { position: { lt: 1 } } },
        }),
      );
    });

    it('is closed to people who neither attend nor operate the event', async () => {
      const { svc } = build({ attending: false, operator: false });
      await expect(svc.feed('e1', 'u1', at(0))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('scoring', () => {
    const q = { points: 100, timeLimitSec: 20, correctIndexes: [1, 2] };

    it('gives nothing for a wrong answer, however fast', () => {
      expect(scoreAnswer(q, 0, 0, true)).toEqual({ correct: false, points: 0 });
    });

    it('accepts any of several right options', () => {
      expect(scoreAnswer(q, 2, 0, false)).toEqual({
        correct: true,
        points: 100,
      });
    });

    it('speed bonus: up to half again, falling linearly to the deadline', () => {
      expect(scoreAnswer(q, 1, 0, true).points).toBe(150);
      expect(scoreAnswer(q, 1, 10_000, true).points).toBe(125);
      expect(scoreAnswer(q, 1, 20_000, true).points).toBe(100);
      expect(scoreAnswer(q, 1, 20_400, true).points).toBe(100); // in the grace window
    });

    it('without the speed bonus, time does not matter', () => {
      expect(scoreAnswer(q, 1, 0, false).points).toBe(
        scoreAnswer(q, 1, 19_000, false).points,
      );
    });

    it('ties share a rank and the next rank skips (1, 2, 2, 4)', () => {
      const ranked = rankPlayers([
        { userId: 'd', points: 50 },
        { userId: 'b', points: 200 },
        { userId: 'c', points: 200 },
        { userId: 'a', points: 300 },
      ]);
      expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 2],
        ['d', 4],
      ]);
    });
  });

  it('a question shows for the lead-in before its window starts', () => {
    const w = questionWindow(T0, 20);
    expect(w.openedAt.getTime() - T0.getTime()).toBe(LEAD_IN_MS);
    expect(w.closesAt.getTime() - w.openedAt.getTime()).toBe(20_000);
    expect(isClosed({ closesAt: null }, T0)).toBe(false);
  });

  it('boardName shows a first name and initial, never the full name', () => {
    expect(
      boardName({ fullName: 'Priya Ramesh Sharma', username: 'priya' }),
    ).toBe('Priya S.');
    expect(boardName({ fullName: 'Arjun', username: null })).toBe('Arjun');
    expect(boardName({ fullName: null, username: 'arj' })).toBe('@arj');
    expect(boardName(undefined)).toBe('Attendee');
  });
});
