import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, QuestionStatus } from '@prisma/client';
import { AuthorizationService } from '../auth/authorization';
import { isAttending } from '../common/attendance';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { canJoinEngagement } from './engagement.access';
import { AskQuestionDto, ModerateQuestionDto, ModerationTarget } from './questions.dto';

/**
 * Asking is capped per person per event: enough for a real follow-up, not a flood.
 * ponytail: count-then-insert, so two requests in the same instant can both pass; fine for a soft cap.
 */
export const ASK_LIMIT = { max: 3, windowMs: 60_000 };

/** The newest questions only; a room past this is a Slido-scale problem. */
const FEED_LIMIT = 300;
/** A projector fits a dozen at most. */
const DISPLAY_LIMIT = 50;

/** Where a moderator may move a question from, per target. Nothing goes back to PENDING. */
export const MODERATION_FROM: Record<ModerationTarget, QuestionStatus[]> = {
  APPROVED: ['PENDING', 'HIDDEN', 'ANSWERED'],
  HIDDEN: ['PENDING', 'APPROVED', 'ANSWERED'],
  // A hidden question marked answered would reappear: approve it first.
  ANSWERED: ['PENDING', 'APPROVED'],
};

/** Only questions people can see can be pinned. */
const PINNABLE: QuestionStatus[] = ['APPROVED', 'ANSWERED'];

/** What an attendee sees: the public questions, plus their own still waiting. Never hidden ones. */
export function attendeeVisible(eventId: string, userId: string): Prisma.QuestionWhereInput {
  return { eventId, OR: [{ status: { in: ['APPROVED', 'ANSWERED'] } }, { status: 'PENDING', userId }] };
}

type Rankable = { pinned: boolean; status: QuestionStatus; votes: number; createdAt: Date };

/** Pinned first, answered ones last, the rest by votes (older first on a tie, so the early ask keeps its place). */
export function rankQuestions<T extends Rankable>(qs: T[]): T[] {
  const tier = (q: T) => (q.pinned ? 0 : q.status === 'ANSWERED' ? 2 : 1);
  return [...qs].sort(
    (a, b) => tier(a) - tier(b) || b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

const INCLUDE = {
  user: { select: { fullName: true, username: true } },
  agenda: { select: { title: true } },
  _count: { select: { votes: true } },
} satisfies Prisma.QuestionInclude;

type Row = Prisma.QuestionGetPayload<{ include: typeof INCLUDE }>;

/**
 * L2 live Q&A, in L1's engagement room. Attendees ask and upvote once each
 * (the DB's unique (question, user) is the rule); organisers (event:edit)
 * moderate. Every change pings the room so open panels refetch.
 */
@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly gateway: LeaderboardGateway,
  ) {}

  private shape(q: Row, userId: string | null, myVotes: Set<string>) {
    return {
      id: q.id,
      text: q.text,
      status: q.status,
      pinned: q.pinned,
      agendaId: q.agendaId,
      agendaTitle: q.agenda?.title ?? null,
      author: q.user.fullName || q.user.username || 'Attendee',
      votes: q._count.votes,
      voted: myVotes.has(q.id),
      mine: q.userId === userId,
      answeredAt: q.answeredAt,
      createdAt: q.createdAt,
    };
  }

  /** The event's mode, its agenda (for the session picker) and the ranked questions matching `where`. */
  private async load(eventId: string, where: Prisma.QuestionWhereInput, userId: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        qaPremoderated: true,
        agenda: { select: { id: true, title: true, startTime: true }, orderBy: { startTime: 'asc' } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const rows = await this.prisma.question.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: FEED_LIMIT,
    });
    const mine = userId
      ? await this.prisma.questionVote.findMany({
          where: { userId, questionId: { in: rows.map((r) => r.id) } },
          select: { questionId: true },
        })
      : [];
    const myVotes = new Set(mine.map((v) => v.questionId));
    return {
      premoderated: event.qaPremoderated,
      sessions: event.agenda,
      questions: rankQuestions(rows.map((r) => this.shape(r, userId, myVotes))),
    };
  }

  /** The attendee panel. `agendaId` narrows it to one session/track. */
  async feed(eventId: string, userId: string, agendaId?: string) {
    if (!(await canJoinEngagement(this.prisma, this.authz, eventId, userId))) {
      throw new ForbiddenException('Only attendees can see this event’s Q&A');
    }
    return this.load(eventId, { ...attendeeVisible(eventId, userId), ...(agendaId ? { agendaId } : {}) }, userId);
  }

  /** The moderation queue: every question, every status. */
  listForManage(eventId: string, agendaId?: string) {
    return this.load(eventId, { eventId, ...(agendaId ? { agendaId } : {}) }, null);
  }

  /**
   * L4 projector wall: approved and answered questions, ranked. No author: the
   * wall is shown to the whole hall and asking has no "show my name" choice,
   * so the user relation is never even selected.
   */
  async display(eventId: string) {
    const rows = await this.prisma.question.findMany({
      where: { eventId, status: { in: ['APPROVED', 'ANSWERED'] } },
      select: {
        id: true,
        text: true,
        status: true,
        pinned: true,
        createdAt: true,
        agenda: { select: { title: true } },
        _count: { select: { votes: true } },
      },
      // The top of the ranking in SQL (enum order puts APPROVED before ANSWERED), then the exact rule.
      orderBy: [{ pinned: 'desc' }, { status: 'asc' }, { votes: { _count: 'desc' } }, { createdAt: 'asc' }],
      take: DISPLAY_LIMIT,
    });
    return rankQuestions(
      rows.map((q) => ({
        id: q.id,
        text: q.text,
        status: q.status,
        pinned: q.pinned,
        agendaTitle: q.agenda?.title ?? null,
        votes: q._count.votes,
        createdAt: q.createdAt,
      })),
    );
  }

  async ask(eventId: string, userId: string, dto: AskQuestionDto) {
    if (!(await isAttending(this.prisma, eventId, userId))) {
      throw new ForbiddenException('Only attendees can ask questions');
    }
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { qaPremoderated: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (dto.agendaId && !(await this.prisma.eventAgenda.count({ where: { id: dto.agendaId, eventId } }))) {
      throw new BadRequestException('That session isn’t part of this event');
    }
    const recent = await this.prisma.question.count({
      where: { eventId, userId, createdAt: { gte: new Date(Date.now() - ASK_LIMIT.windowMs) } },
    });
    if (recent >= ASK_LIMIT.max) {
      throw new HttpException('You’re asking quickly. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const status: QuestionStatus = event.qaPremoderated ? 'PENDING' : 'APPROVED';
    await this.prisma.question.create({
      data: { eventId, userId, agendaId: dto.agendaId ?? null, text: dto.text.trim(), status },
    });
    this.gateway.engagementChanged(eventId);
    return { ok: true, status };
  }

  async vote(eventId: string, questionId: string, userId: string) {
    if (!(await isAttending(this.prisma, eventId, userId))) {
      throw new ForbiddenException('Only attendees can vote');
    }
    const q = await this.prisma.question.findFirst({ where: { id: questionId, eventId }, select: { status: true } });
    if (!q) throw new NotFoundException('Question not found');
    if (q.status !== 'APPROVED') throw new BadRequestException('Only open questions take votes');
    try {
      await this.prisma.questionVote.create({ data: { questionId, userId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You already upvoted this');
      }
      throw err;
    }
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  async unvote(eventId: string, questionId: string, userId: string) {
    const { count } = await this.prisma.questionVote.deleteMany({ where: { questionId, userId, question: { eventId } } });
    if (count) this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  /** Move a question's status and/or pin it. Each step is one guarded update, so a stale tap can't skip a rule. */
  async moderate(eventId: string, questionId: string, dto: ModerateQuestionDto) {
    const { status, pinned } = dto;
    if (status === undefined && pinned === undefined) throw new BadRequestException('Nothing to change');

    const refuse = async (why: string): Promise<never> => {
      const exists = await this.prisma.question.count({ where: { id: questionId, eventId } });
      throw exists ? new BadRequestException(why) : new NotFoundException('Question not found');
    };

    if (status) {
      const { count } = await this.prisma.question.updateMany({
        where: { id: questionId, eventId, status: { in: MODERATION_FROM[status] } },
        data: {
          status,
          ...(status === 'ANSWERED' ? { answeredAt: new Date() } : {}),
          ...(status === 'HIDDEN' ? { pinned: false } : {}),
        },
      });
      if (!count) await refuse(status === 'ANSWERED' ? 'Approve this question first' : 'It’s already there');
    }
    if (pinned !== undefined) {
      const { count } = await this.prisma.question.updateMany({
        where: { id: questionId, eventId, ...(pinned ? { status: { in: PINNABLE } } : {}) },
        data: { pinned },
      });
      if (!count) await refuse('Approve this question before pinning it');
    }
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  async setPremoderated(eventId: string, premoderated: boolean) {
    await this.prisma.event.update({ where: { id: eventId }, data: { qaPremoderated: premoderated } });
    this.gateway.engagementChanged(eventId);
    return { ok: true, premoderated };
  }
}
