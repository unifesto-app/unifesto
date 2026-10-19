import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Quiz, QuizQuestion } from '@prisma/client';
import { AuthorizationService } from '../auth/authorization';
import { isAttending } from '../common/attendance';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { canJoinEngagement } from './engagement.access';
import {
  isClosed,
  questionWindow,
  rankPlayers,
  revealAt,
  scoreAnswer,
} from './quiz.scoring';
import { SaveQuizDto } from './quizzes.dto';

/** Attendees see the top of the board plus their own row. */
const TOP_N = 10;
/** Organisers see a longer board. */
const MANAGE_TOP_N = 50;

/** "Priya S." from "Priya Sharma"; the board is shown to the whole room. */
export function boardName(
  u: { fullName: string | null; username: string | null } | undefined,
): string {
  const parts = u?.fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length)
    return parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1][0]}.`
      : parts[0];
  return u?.username ? `@${u.username}` : 'Attendee';
}

/**
 * L3 live quizzes. Organisers (event:edit) build, start, step and end;
 * attendees answer each question once. The server owns the clock: it stamps
 * each question's window, scores answers on arrival and keeps the right option
 * to itself until the window has closed. Every state change pings the event's
 * engagement room at once (a question's window is ticking).
 */
@Injectable()
export class QuizzesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly gateway: LeaderboardGateway,
  ) {}

  /** Questions whose position is below this are closed and count on the board. */
  private closedUpTo(
    quiz: Pick<Quiz, 'status' | 'currentIndex'>,
    current: QuizQuestion | null,
    now: Date,
  ) {
    if (quiz.status === 'ENDED') return Number.MAX_SAFE_INTEGER;
    if (quiz.currentIndex === null) return 0;
    return quiz.currentIndex + (current && isClosed(current, now) ? 1 : 0);
  }

  /**
   * Ranked board over closed questions only, so a rank never moves while a
   * question is open (that would leak who got it right).
   * ponytail: one groupBy per read; memoise per (quiz, closedUpTo) if rooms of
   * thousands refetch at every close.
   */
  private async board(
    quizId: string,
    closedUpTo: number,
    top: number,
    userId?: string,
  ) {
    const sums = await this.prisma.quizAnswer.groupBy({
      by: ['userId'],
      where: { quizId, question: { position: { lt: closedUpTo } } },
      _sum: { points: true },
    });
    const ranked = rankPlayers(
      sums.map((s) => ({ userId: s.userId, points: s._sum.points ?? 0 })),
    );
    const shown = ranked.slice(0, top);
    const mine = userId ? ranked.find((r) => r.userId === userId) : undefined;
    const ids = [
      ...new Set([...shown, ...(mine ? [mine] : [])].map((r) => r.userId)),
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true, username: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const row = (r: (typeof ranked)[number]) => ({
      rank: r.rank,
      name: boardName(byId.get(r.userId)),
      score: r.score,
      isMe: r.userId === userId,
    });
    return {
      players: ranked.length,
      top: shown.map(row),
      me: mine ? row(mine) : null,
    };
  }

  private assertQuestions(dto: SaveQuizDto) {
    dto.questions.forEach((q, i) => {
      const bad = q.correctIndexes.some((c) => c >= q.options.length);
      if (bad)
        throw new BadRequestException(
          `Question ${i + 1}: the right answer must be one of its options`,
        );
    });
  }

  private questionRows(dto: SaveQuizDto) {
    return dto.questions.map((q, position) => ({
      position,
      prompt: q.prompt.trim(),
      options: q.options.map((o) => o.trim()),
      correctIndexes: [...new Set(q.correctIndexes)].sort((a, b) => a - b),
      timeLimitSec: q.timeLimitSec ?? 20,
      points: q.points ?? 100,
    }));
  }

  // ── Organisers ──────────────────────────────────────────────────────────

  /** Every quiz with its questions (right answers included), per-option counts and the board. */
  async listForManage(eventId: string, now = new Date()) {
    const quizzes = await this.prisma.quiz.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    const ids = quizzes.map((q) => q.id);
    const counts = ids.length
      ? await this.prisma.quizAnswer.groupBy({
          by: ['questionId', 'optionIndex'],
          where: { quizId: { in: ids } },
          _count: { _all: true },
        })
      : [];
    const byQuestion = new Map<string, number[]>();
    for (const c of counts) {
      const arr = byQuestion.get(c.questionId) ?? [];
      arr[c.optionIndex] = c._count._all;
      byQuestion.set(c.questionId, arr);
    }
    return Promise.all(
      quizzes.map(async (quiz) => {
        const current =
          quiz.currentIndex === null
            ? null
            : (quiz.questions[quiz.currentIndex] ?? null);
        return {
          ...quiz,
          serverNow: now.toISOString(),
          questions: quiz.questions.map((q) => {
            const results = q.options.map(
              (_, i) => byQuestion.get(q.id)?.[i] ?? 0,
            );
            return {
              ...q,
              closed: isClosed(q, now),
              revealAt: revealAt(q),
              results,
              answered: results.reduce((a, b) => a + b, 0),
            };
          }),
          leaderboard:
            quiz.status === 'DRAFT'
              ? null
              : await this.board(
                  quiz.id,
                  this.closedUpTo(quiz, current, now),
                  MANAGE_TOP_N,
                ),
        };
      }),
    );
  }

  async create(eventId: string, dto: SaveQuizDto) {
    this.assertQuestions(dto);
    return this.prisma.quiz.create({
      data: {
        eventId,
        title: dto.title.trim(),
        speedBonus: dto.speedBonus ?? true,
        questions: { create: this.questionRows(dto) },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
  }

  /** Drafts only: once a quiz has run, its questions are what people answered. */
  async update(eventId: string, quizId: string, dto: SaveQuizDto) {
    this.assertQuestions(dto);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.quiz.updateMany({
        where: { id: quizId, eventId, status: 'DRAFT' },
        data: { title: dto.title.trim(), speedBonus: dto.speedBonus ?? true },
      });
      if (!count)
        throw new BadRequestException('Only a draft quiz can be edited');
      await tx.quizQuestion.deleteMany({ where: { quizId } });
      await tx.quizQuestion.createMany({
        data: this.questionRows(dto).map((q) => ({ ...q, quizId })),
      });
    });
    return { ok: true };
  }

  async start(eventId: string, quizId: string, now = new Date()) {
    const live = await this.prisma.quiz.count({
      where: { eventId, status: 'LIVE' },
    });
    if (live)
      throw new BadRequestException('Another quiz is running. End it first.');
    await this.prisma.$transaction(async (tx) => {
      const first = await tx.quizQuestion.findFirst({
        where: { quizId, quiz: { eventId }, position: 0 },
      });
      if (!first) throw new NotFoundException('Quiz not found');
      const { count } = await tx.quiz.updateMany({
        where: { id: quizId, eventId, status: 'DRAFT' },
        data: { status: 'LIVE', currentIndex: 0, startedAt: now },
      });
      if (!count) throw new BadRequestException('This quiz has already run');
      await tx.quizQuestion.update({
        where: { id: first.id },
        data: questionWindow(now, first.timeLimitSec),
      });
    });
    this.gateway.engagementChanged(eventId, true);
    return { ok: true };
  }

  /** Close the open question (if it still is) and open the next one. */
  async next(eventId: string, quizId: string, now = new Date()) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, eventId },
      select: {
        status: true,
        currentIndex: true,
        _count: { select: { questions: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== 'LIVE' || quiz.currentIndex === null)
      throw new BadRequestException('This quiz is not running');
    const k = quiz.currentIndex;
    if (k + 1 >= quiz._count.questions) {
      throw new BadRequestException(
        'That was the last question. End the quiz to show the final board.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      // Conditional on the index we read: a double tap moves one step, not two.
      const { count } = await tx.quiz.updateMany({
        where: { id: quizId, status: 'LIVE', currentIndex: k },
        data: { currentIndex: k + 1 },
      });
      if (!count) throw new BadRequestException('The quiz already moved on');
      await tx.quizQuestion.updateMany({
        where: { quizId, position: k, closesAt: { gt: now } },
        data: { closesAt: now },
      });
      const nextQ = await tx.quizQuestion.findFirstOrThrow({
        where: { quizId, position: k + 1 },
      });
      await tx.quizQuestion.update({
        where: { id: nextQ.id },
        data: questionWindow(now, nextQ.timeLimitSec),
      });
    });
    this.gateway.engagementChanged(eventId, true);
    return { ok: true };
  }

  /** Stop taking answers on the open question now and reveal it. */
  async closeQuestion(eventId: string, quizId: string, now = new Date()) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, eventId },
      select: { status: true, currentIndex: true },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');
    if (quiz.status !== 'LIVE' || quiz.currentIndex === null)
      throw new BadRequestException('This quiz is not running');
    await this.prisma.quizQuestion.updateMany({
      where: { quizId, position: quiz.currentIndex, closesAt: { gt: now } },
      data: { closesAt: now },
    });
    this.gateway.engagementChanged(eventId, true);
    return { ok: true };
  }

  async end(eventId: string, quizId: string, now = new Date()) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.quiz.updateMany({
        where: { id: quizId, eventId, status: 'LIVE' },
        data: { status: 'ENDED', endedAt: now },
      });
      if (!count) throw new BadRequestException('This quiz is not running');
      await tx.quizQuestion.updateMany({
        where: { quizId, closesAt: { gt: now } },
        data: { closesAt: now },
      });
    });
    this.gateway.engagementChanged(eventId, true);
    return { ok: true };
  }

  /** Drafts and ended quizzes only: a running one is ended first. */
  async remove(eventId: string, quizId: string) {
    const { count } = await this.prisma.quiz.deleteMany({
      where: { id: quizId, eventId, status: { not: 'LIVE' } },
    });
    if (!count)
      throw new BadRequestException('End the quiz before deleting it');
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  // ── Attendees ───────────────────────────────────────────────────────────

  /**
   * The attendee panel: the running quiz (else the last one to end) with its
   * open question and the board. The right option and this person's score on
   * the question appear only once the question has closed.
   */
  async feed(eventId: string, userId: string, now = new Date()) {
    if (!(await canJoinEngagement(this.prisma, this.authz, eventId, userId))) {
      throw new ForbiddenException(
        'Only attendees can see this event’s quizzes',
      );
    }
    const quiz =
      (await this.prisma.quiz.findFirst({
        where: { eventId, status: 'LIVE' },
      })) ??
      (await this.prisma.quiz.findFirst({
        where: { eventId, status: 'ENDED' },
        orderBy: { endedAt: 'desc' },
      }));
    if (!quiz) return { serverNow: now.toISOString(), quiz: null };

    const [questionCount, current] = await Promise.all([
      this.prisma.quizQuestion.count({ where: { quizId: quiz.id } }),
      quiz.status === 'LIVE' && quiz.currentIndex !== null
        ? this.prisma.quizQuestion.findFirst({
            where: { quizId: quiz.id, position: quiz.currentIndex },
          })
        : null,
    ]);
    const mine = current
      ? await this.prisma.quizAnswer.findUnique({
          where: { questionId_userId: { questionId: current.id, userId } },
          select: { optionIndex: true, correct: true, points: true },
        })
      : null;

    const closed = !!current && isClosed(current, now);
    const question = current && {
      id: current.id,
      position: current.position,
      prompt: current.prompt,
      options: current.options,
      timeLimitSec: current.timeLimitSec,
      points: current.points,
      openedAt: current.openedAt,
      closesAt: current.closesAt,
      revealAt: revealAt(current),
      closed,
      // Never before close: the right option, or whether this answer was it.
      correctIndexes: closed ? current.correctIndexes : null,
      myAnswer: mine
        ? {
            optionIndex: mine.optionIndex,
            correct: closed ? mine.correct : null,
            points: closed ? mine.points : null,
          }
        : null,
    };

    return {
      serverNow: now.toISOString(),
      quiz: {
        id: quiz.id,
        title: quiz.title,
        status: quiz.status,
        speedBonus: quiz.speedBonus,
        questionCount,
        question,
        leaderboard: await this.board(
          quiz.id,
          this.closedUpTo(quiz, current, now),
          TOP_N,
          userId,
        ),
      },
    };
  }

  /**
   * L4 projector: the running quiz (else the last to end), its open question
   * with the countdown, and the board by display name. Like the attendee feed,
   * the right option and the per-option spread wait for the question to close.
   */
  async display(eventId: string, now = new Date()) {
    const quiz =
      (await this.prisma.quiz.findFirst({ where: { eventId, status: 'LIVE' } })) ??
      (await this.prisma.quiz.findFirst({
        where: { eventId, status: 'ENDED' },
        orderBy: { endedAt: 'desc' },
      }));
    if (!quiz) return null;
    const [questionCount, current] = await Promise.all([
      this.prisma.quizQuestion.count({ where: { quizId: quiz.id } }),
      quiz.status === 'LIVE' && quiz.currentIndex !== null
        ? this.prisma.quizQuestion.findFirst({
            where: { quizId: quiz.id, position: quiz.currentIndex },
          })
        : null,
    ]);
    const counts = current
      ? await this.prisma.quizAnswer.groupBy({
          by: ['optionIndex'],
          where: { questionId: current.id },
          _count: { _all: true },
        })
      : [];
    const closed = !!current && isClosed(current, now);
    const results = (current?.options ?? []).map(
      (_, i) => counts.find((c) => c.optionIndex === i)?._count._all ?? 0,
    );
    const question = current && {
      position: current.position,
      prompt: current.prompt,
      options: current.options,
      timeLimitSec: current.timeLimitSec,
      openedAt: current.openedAt,
      closesAt: current.closesAt,
      revealAt: revealAt(current),
      closed,
      answered: results.reduce((a, b) => a + b, 0),
      correctIndexes: closed ? current.correctIndexes : null,
      results: closed ? results : null,
    };
    const board = await this.board(
      quiz.id,
      this.closedUpTo(quiz, current, now),
      TOP_N,
    );
    return {
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      startedAt: quiz.startedAt,
      endedAt: quiz.endedAt,
      questionCount,
      question,
      leaderboard: {
        players: board.players,
        top: board.top.map(({ rank, name, score }) => ({ rank, name, score })),
      },
    };
  }

  async answer(
    eventId: string,
    quizId: string,
    userId: string,
    questionId: string,
    optionIndex: number,
    now = new Date(),
  ) {
    if (!(await isAttending(this.prisma, eventId, userId))) {
      throw new ForbiddenException('Only attendees can answer');
    }
    const q = await this.prisma.quizQuestion.findFirst({
      where: { id: questionId, quizId, quiz: { eventId } },
      include: {
        quiz: {
          select: { status: true, currentIndex: true, speedBonus: true },
        },
      },
    });
    if (!q) throw new NotFoundException('Question not found');
    if (
      q.quiz.status !== 'LIVE' ||
      q.quiz.currentIndex !== q.position ||
      !q.openedAt ||
      !q.closesAt
    ) {
      throw new BadRequestException('This question is not open');
    }
    if (now < q.openedAt)
      throw new BadRequestException('Answers open in a moment');
    if (isClosed(q, now)) throw new BadRequestException('Time’s up');
    if (optionIndex >= q.options.length)
      throw new BadRequestException('Unknown option');

    const elapsedMs = now.getTime() - q.openedAt.getTime();
    const { correct, points } = scoreAnswer(
      q,
      optionIndex,
      elapsedMs,
      q.quiz.speedBonus,
    );
    try {
      await this.prisma.quizAnswer.create({
        data: {
          questionId,
          quizId,
          userId,
          optionIndex,
          correct,
          points,
          elapsedMs,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You already answered');
      }
      throw err;
    }
    return this.feed(eventId, userId, now);
  }
}
