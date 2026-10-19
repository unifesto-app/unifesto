import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Poll, PollStatus, Prisma } from '@prisma/client';
import { AuthorizationService } from '../auth/authorization';
import { isAttending } from '../common/attendance';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { canJoinEngagement } from './engagement.access';
import { CreatePollDto } from './polls.dto';

/** Attendees see the latest polls only; older ones drop off the panel. */
const FEED_LIMIT = 20;

/** Whether an attendee may see a poll's counts. Organisers always can. */
export function resultsVisible(
  poll: Pick<Poll, 'status' | 'resultsVisibility'>,
  voted: boolean,
): boolean {
  if (poll.resultsVisibility === 'ORGANISERS_ONLY') return false;
  if (poll.status === 'CLOSED') return true;
  return poll.resultsVisibility === 'AFTER_VOTE' && voted;
}

/**
 * L1 live polls. Organisers (event:edit) create, launch and close; attendees
 * vote once each (the DB's unique (poll, user) is the rule, not this code).
 * Every change pings the event's engagement room so open panels refetch.
 */
@Injectable()
export class PollsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly gateway: LeaderboardGateway,
  ) {}

  /** Vote counts per option, keyed by poll id. */
  private async counts(pollIds: string[]): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    if (!pollIds.length) return map;
    const rows = await this.prisma.pollVote.groupBy({
      by: ['pollId', 'optionIndex'],
      where: { pollId: { in: pollIds } },
      _count: { _all: true },
    });
    for (const r of rows) {
      const arr = map.get(r.pollId) ?? [];
      arr[r.optionIndex] = r._count._all;
      map.set(r.pollId, arr);
    }
    return map;
  }

  private shape(poll: Poll, counts: number[] | undefined, show: boolean) {
    const results = poll.options.map((_, i) => counts?.[i] ?? 0);
    return {
      ...poll,
      results: show ? results : null,
      totalVotes: show ? results.reduce((a, b) => a + b, 0) : null,
    };
  }

  async listForManage(eventId: string) {
    const polls = await this.prisma.poll.findMany({ where: { eventId }, orderBy: { createdAt: 'desc' } });
    const counts = await this.counts(polls.map((p) => p.id));
    return polls.map((p) => this.shape(p, counts.get(p.id), true));
  }

  async create(eventId: string, dto: CreatePollDto) {
    const poll = await this.prisma.poll.create({
      data: {
        eventId,
        question: dto.question.trim(),
        options: dto.options.map((o) => o.trim()),
        resultsVisibility: dto.resultsVisibility,
      },
    });
    return this.shape(poll, undefined, true);
  }

  /** Move a poll one step along DRAFT -> LIVE -> CLOSED; atomic, so a double tap can't skip. */
  private async move(eventId: string, pollId: string, from: PollStatus, data: Prisma.PollUpdateManyMutationInput) {
    const { count } = await this.prisma.poll.updateMany({ where: { id: pollId, eventId, status: from }, data });
    if (!count) {
      const exists = await this.prisma.poll.count({ where: { id: pollId, eventId } });
      if (!exists) throw new NotFoundException('Poll not found');
      throw new BadRequestException(from === 'DRAFT' ? 'This poll was already launched' : 'This poll is not live');
    }
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  launch(eventId: string, pollId: string) {
    return this.move(eventId, pollId, 'DRAFT', { status: 'LIVE', launchedAt: new Date() });
  }

  close(eventId: string, pollId: string) {
    return this.move(eventId, pollId, 'LIVE', { status: 'CLOSED', closedAt: new Date() });
  }

  async setVisibility(eventId: string, pollId: string, resultsVisibility: Poll['resultsVisibility']) {
    const { count } = await this.prisma.poll.updateMany({ where: { id: pollId, eventId }, data: { resultsVisibility } });
    if (!count) throw new NotFoundException('Poll not found');
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  /** Drafts and closed polls only: pulling a live poll from under voters is a close. */
  async remove(eventId: string, pollId: string) {
    const { count } = await this.prisma.poll.deleteMany({ where: { id: pollId, eventId, status: { not: 'LIVE' } } });
    if (!count) throw new BadRequestException('Close the poll before deleting it');
    this.gateway.engagementChanged(eventId);
    return { ok: true };
  }

  /**
   * L4 projector: the live poll, else the last one closed. Counts follow the
   * poll's own rule as if the room had voted; the total always shows.
   */
  async display(eventId: string) {
    const poll =
      (await this.prisma.poll.findFirst({ where: { eventId, status: 'LIVE' }, orderBy: { launchedAt: 'desc' } })) ??
      (await this.prisma.poll.findFirst({ where: { eventId, status: 'CLOSED' }, orderBy: { closedAt: 'desc' } }));
    if (!poll) return null;
    const counts = (await this.counts([poll.id])).get(poll.id);
    const results = poll.options.map((_, i) => counts?.[i] ?? 0);
    return {
      id: poll.id,
      question: poll.question,
      options: poll.options,
      status: poll.status,
      launchedAt: poll.launchedAt,
      closedAt: poll.closedAt,
      totalVotes: results.reduce((a, b) => a + b, 0),
      results: resultsVisible(poll, true) ? results : null,
    };
  }

  /** The attendee panel: live and closed polls, newest first, with counts where allowed. */
  async feed(eventId: string, userId: string) {
    if (!(await canJoinEngagement(this.prisma, this.authz, eventId, userId))) {
      throw new ForbiddenException('Only attendees can see this event’s polls');
    }
    const polls = await this.prisma.poll.findMany({
      where: { eventId, status: { not: 'DRAFT' } },
      orderBy: { launchedAt: 'desc' },
      take: FEED_LIMIT,
    });
    const ids = polls.map((p) => p.id);
    const [counts, mine] = await Promise.all([
      this.counts(ids),
      this.prisma.pollVote.findMany({ where: { pollId: { in: ids }, userId }, select: { pollId: true, optionIndex: true } }),
    ]);
    const myVote = new Map(mine.map((v) => [v.pollId, v.optionIndex]));
    return {
      polls: polls.map((p) => ({
        ...this.shape(p, counts.get(p.id), resultsVisible(p, myVote.has(p.id))),
        myVote: myVote.get(p.id) ?? null,
      })),
    };
  }

  async vote(eventId: string, pollId: string, userId: string, optionIndex: number) {
    if (!(await isAttending(this.prisma, eventId, userId))) {
      throw new ForbiddenException('Only attendees can vote');
    }
    const poll = await this.prisma.poll.findFirst({ where: { id: pollId, eventId }, select: { status: true, options: true } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.status !== 'LIVE') throw new BadRequestException('This poll is not open');
    if (optionIndex >= poll.options.length) throw new BadRequestException('Unknown option');
    try {
      await this.prisma.pollVote.create({ data: { pollId, userId, optionIndex } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('You already voted');
      }
      throw err;
    }
    this.gateway.engagementChanged(eventId);
    return this.feed(eventId, userId);
  }
}
