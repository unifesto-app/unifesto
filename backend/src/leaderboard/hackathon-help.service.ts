import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HackathonHelpQueryStatus, Prisma, RoleCode, SupportCaseKind, SupportDesk } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SPACE_ADMIN_ROLE_CODES } from '../auth/authorization';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { HackathonHelpDeskEvent } from '../notifications/notifications.events';
import { LeaderboardService } from './leaderboard.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { cleanName } from './hackathon.shared';
import { SUBJECT_CASE_OPEN, type SubjectCaseOpen } from '../support/subject-cases';
import type { CreateHelpTopicDto, RaiseHelpQueryDto, UpdateHelpTopicDto } from './dto/hackathon.dto';

const USER_SELECT = { id: true, fullName: true, username: true, avatarUrl: true } as const;
const CURATOR_CODES: RoleCode[] = [RoleCode.CURATOR, RoleCode.CO_CURATOR];
/** How many unresolved queries a team may have at once. */
const MAX_OPEN_PER_TEAM = 5;

/**
 * Who a team's query goes to: the topic's POCs plus the volunteers in the
 * team's room; "Other" (no topic) goes to the curators plus the room's
 * volunteers. If that's nobody, the curators get it so nothing is dropped.
 */
export function helpQueryRecipients(input: {
  pocUserIds: string[] | null;
  roomVolunteerIds: string[];
  curatorIds: string[];
  exclude: string[];
}): string[] {
  const primary = input.pocUserIds ?? input.curatorIds;
  let ids = new Set([...primary, ...input.roomVolunteerIds]);
  for (const id of input.exclude) ids.delete(id);
  if (!ids.size) ids = new Set(input.curatorIds.filter((id) => !input.exclude.includes(id)));
  return [...ids];
}

const displayName = (u?: { fullName: string | null; username: string | null } | null) => u?.fullName || u?.username || null;

/**
 * Hackathon help desk: curators set up help topics ("Food", "Wi-Fi") with
 * points of contact from the event team and put volunteers in rooms; teams
 * raise queries; the POCs / volunteers / curators get them, pick them up and
 * resolve them. Staff are anyone on the event team (event-scoped UserRole).
 */
@Injectable()
export class HackathonHelpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Event team (the pool for volunteers and POCs) ─────────────────────────

  /** Everyone on the event team, with their role. */
  async eventTeam(eventId: string) {
    const rows = await this.prisma.userRole.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: { user: { select: USER_SELECT }, role: { select: { code: true } } },
    });
    return rows.map((r) => ({ ...r.user, roleCode: r.role?.code ?? null }));
  }

  /** Throws unless every id is on the event team. Returns them deduped. */
  async assertOnEventTeam(eventId: string, userIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set(userIds ?? [])];
    if (!ids.length) return ids;
    const found = await this.prisma.userRole.findMany({
      where: { eventId, userId: { in: ids } },
      select: { userId: true },
      distinct: ['userId'],
    });
    if (found.length !== ids.length) {
      throw new BadRequestException('Only people on the event team can be picked. Add them under Team first.');
    }
    return ids;
  }

  private async isStaff(userId: string, eventId: string) {
    return !!(await this.prisma.userRole.findFirst({ where: { eventId, userId }, select: { id: true } }));
  }

  /** Curators and Co-Curators of the event; the space admins when it has none. */
  private async curatorIds(eventId: string): Promise<string[]> {
    const own = await this.prisma.userRole.findMany({
      where: { eventId, role: { code: { in: CURATOR_CODES } } },
      select: { userId: true },
    });
    if (own.length) return [...new Set(own.map((r) => r.userId))];
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { spaceId: true } });
    if (!event?.spaceId) return [];
    const admins = await this.prisma.userRole.findMany({
      where: { spaceId: event.spaceId, eventId: null, role: { code: { in: [...SPACE_ADMIN_ROLE_CODES] } } },
      select: { userId: true },
    });
    return [...new Set(admins.map((r) => r.userId))];
  }

  // ── Curator: topics ───────────────────────────────────────────────────────

  /** Help topics with their POCs, and the event team to pick POCs from. */
  async listTopics(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const [topics, staff] = await Promise.all([
      this.prisma.hackathonHelpTopic.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
      }),
      this.eventTeam(eventId),
    ]);
    return {
      staff,
      topics: topics.map((t) => ({
        id: t.id,
        name: t.name,
        pocs: t.pocUserIds.map((id) => staff.find((s) => s.id === id)).filter((s): s is (typeof staff)[number] => !!s),
      })),
    };
  }

  async createTopic(userId: string, eventId: string, dto: CreateHelpTopicDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const name = cleanName(dto.name, 60);
    if (!name) throw new BadRequestException('Name the topic, like "Food".');
    const pocUserIds = await this.assertOnEventTeam(eventId, dto.pocUserIds);
    const last = await this.prisma.hackathonHelpTopic.findFirst({
      where: { leaderboardId: board.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    try {
      await this.prisma.hackathonHelpTopic.create({
        data: { leaderboardId: board.id, name, pocUserIds, order: last ? last.order + 1 : 0 },
      });
    } catch (err) {
      throw this.topicNameTaken(err, name);
    }
    return this.listTopics(userId, eventId);
  }

  async updateTopic(userId: string, eventId: string, topicId: string, dto: UpdateHelpTopicDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findTopicOrThrow(board.id, topicId);
    const name = dto.name !== undefined ? cleanName(dto.name, 60) : undefined;
    if (name === null) throw new BadRequestException('Name the topic.');
    const pocUserIds = dto.pocUserIds !== undefined ? await this.assertOnEventTeam(eventId, dto.pocUserIds) : undefined;
    try {
      await this.prisma.hackathonHelpTopic.update({
        where: { id: topicId },
        data: { ...(name ? { name } : {}), ...(pocUserIds ? { pocUserIds } : {}) },
      });
    } catch (err) {
      throw this.topicNameTaken(err, name ?? '');
    }
    return this.listTopics(userId, eventId);
  }

  /** Past queries keep the topic's name. */
  async deleteTopic(userId: string, eventId: string, topicId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findTopicOrThrow(board.id, topicId);
    await this.prisma.hackathonHelpTopic.delete({ where: { id: topicId } });
    return this.listTopics(userId, eventId);
  }

  // ── Team ──────────────────────────────────────────────────────────────────

  /** The topics a team can ask about, its room's volunteers, and its queries. */
  async getMyHelp(userId: string, eventId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const [topics, room, queries] = await Promise.all([
      this.prisma.hackathonHelpTopic.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      team.roomId
        ? this.prisma.hackathonRoom.findUnique({ where: { id: team.roomId }, select: { name: true, volunteerUserIds: true } })
        : null,
      this.prisma.hackathonHelpQuery.findMany({
        where: { entrantId: team.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const users = await this.users([...(room?.volunteerUserIds ?? []), ...queries.map((q) => q.handledBy)]);
    return {
      topics,
      room: room
        ? {
            name: room.name,
            volunteers: room.volunteerUserIds.map((id) => users.get(id)).filter(Boolean).map((u) => ({ name: displayName(u), avatarUrl: u!.avatarUrl })),
          }
        : null,
      queries: queries.map((q) => ({
        id: q.id,
        topicName: q.topicName,
        message: q.message,
        status: q.status,
        handledByName: displayName(users.get(q.handledBy ?? '')),
        createdAt: q.createdAt,
        acknowledgedAt: q.acknowledgedAt,
        resolvedAt: q.resolvedAt,
        escalatedAt: q.escalatedAt,
        caseId: q.caseId,
      })),
    };
  }

  async raise(userId: string, eventId: string, dto: RaiseHelpQueryDto) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const message = dto.message.replace(/\r\n/g, '\n').trim().slice(0, 1000);
    if (!message) throw new BadRequestException('Say what you need.');

    const topic = dto.topicId
      ? await this.prisma.hackathonHelpTopic.findFirst({ where: { id: dto.topicId, leaderboardId: board.id } })
      : null;
    if (dto.topicId && !topic) throw new NotFoundException('That topic is gone. Pick another one.');

    const open = await this.prisma.hackathonHelpQuery.findMany({
      where: { entrantId: team.id, status: { not: HackathonHelpQueryStatus.RESOLVED } },
      select: { topicId: true },
    });
    if (open.some((q) => q.topicId === (topic?.id ?? null))) {
      throw new BadRequestException(`You already have an open ${topic?.name ?? 'Other'} query. We'll get to it.`);
    }
    if (open.length >= MAX_OPEN_PER_TEAM) {
      throw new BadRequestException(`You have ${open.length} open queries. Wait for one to be resolved.`);
    }

    const room = team.roomId
      ? await this.prisma.hackathonRoom.findUnique({ where: { id: team.roomId }, select: { id: true, name: true, volunteerUserIds: true } })
      : null;
    const teamUsers = (await this.leaderboard.teamUserIds([team.id])).get(team.id) ?? [];
    const notifiedUserIds = helpQueryRecipients({
      pocUserIds: topic ? topic.pocUserIds : null,
      roomVolunteerIds: room?.volunteerUserIds ?? [],
      curatorIds: await this.curatorIds(eventId),
      exclude: teamUsers,
    });

    const query = await this.prisma.hackathonHelpQuery.create({
      data: {
        leaderboardId: board.id,
        entrantId: team.id,
        topicId: topic?.id ?? null,
        topicName: topic?.name ?? 'Other',
        roomId: room?.id ?? null,
        roomName: room?.name ?? null,
        message,
        raisedBy: userId,
        notifiedUserIds,
      },
    });
    const who = [team.teamCode, room?.name].filter(Boolean).join(' · ') || team.name;
    this.emit({
      userIds: notifiedUserIds,
      eventId,
      title: `${query.topicName} query · ${who}`,
      body: message.slice(0, 180),
      deepLink: `unifesto://hackathon/${eventId}/help-desk`,
      toStaff: true,
    });
    return this.getMyHelp(userId, eventId);
  }

  // ── Staff: inbox ──────────────────────────────────────────────────────────

  /**
   * Queries for the event team: ones sent to me, or every query for curators.
   * Null when the event runs no hackathon. Throws for people not on the team.
   */
  async inbox(userId: string, eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({ where: { eventId }, select: { id: true, isHackathon: true } });
    if (!board?.isHackathon) return null;
    const manager = await this.leaderboard.canManage(userId, eventId);
    if (!manager && !(await this.isStaff(userId, eventId))) {
      throw new ForbiddenException("You're not on this event's team.");
    }
    const where: Prisma.HackathonHelpQueryWhereInput = {
      leaderboardId: board.id,
      ...(manager ? {} : { notifiedUserIds: { has: userId } }),
    };
    const [active, resolved] = await Promise.all([
      this.prisma.hackathonHelpQuery.findMany({
        where: { ...where, status: { not: HackathonHelpQueryStatus.RESOLVED } },
        orderBy: { createdAt: 'asc' },
        include: { entrant: { select: { teamCode: true, name: true } } },
      }),
      this.prisma.hackathonHelpQuery.findMany({
        where: { ...where, status: HackathonHelpQueryStatus.RESOLVED },
        orderBy: { resolvedAt: 'desc' },
        take: 30,
        include: { entrant: { select: { teamCode: true, name: true } } },
      }),
    ]);
    const rows = [...active, ...resolved];
    const users = await this.users(rows.flatMap((q) => [q.handledBy, q.raisedBy]));
    return {
      canManage: manager,
      queries: rows.map((q) => ({
        id: q.id,
        topicName: q.topicName,
        roomName: q.roomName,
        message: q.message,
        status: q.status,
        team: { teamCode: q.entrant.teamCode, name: q.entrant.name },
        raisedByName: displayName(users.get(q.raisedBy)),
        handledByName: displayName(users.get(q.handledBy ?? '')),
        handledByMe: q.handledBy === userId,
        sentToMe: q.notifiedUserIds.includes(userId),
        createdAt: q.createdAt,
        acknowledgedAt: q.acknowledgedAt,
        resolvedAt: q.resolvedAt,
      })),
    };
  }

  /** Pick a query up, resolve it, or reopen it. The team hears about the first two. */
  async setStatus(userId: string, eventId: string, queryId: string, status: HackathonHelpQueryStatus) {
    const board = await this.teams.getBoardOrThrow(eventId);
    const query = await this.prisma.hackathonHelpQuery.findFirst({
      where: { id: queryId, leaderboardId: board.id },
      include: { entrant: { select: { id: true, teamCode: true } } },
    });
    if (!query) throw new NotFoundException('Query not found');
    const manager = await this.leaderboard.canManage(userId, eventId);
    if (!manager && !(query.notifiedUserIds.includes(userId) && (await this.isStaff(userId, eventId)))) {
      throw new ForbiddenException('This query wasn’t sent to you.');
    }
    if (query.status === status) return this.inbox(userId, eventId);

    const now = new Date();
    await this.prisma.hackathonHelpQuery.update({
      where: { id: queryId },
      data:
        status === HackathonHelpQueryStatus.OPEN
          ? { status, handledBy: null, acknowledgedAt: null, resolvedAt: null }
          : status === HackathonHelpQueryStatus.ACKNOWLEDGED
            ? { status, handledBy: userId, acknowledgedAt: now, resolvedAt: null }
            : { status, handledBy: query.handledBy ?? userId, acknowledgedAt: query.acknowledgedAt ?? now, resolvedAt: now },
    });

    if (status !== HackathonHelpQueryStatus.OPEN) {
      const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } });
      const teamUsers = (await this.leaderboard.teamUserIds([query.entrant.id])).get(query.entrant.id) ?? [];
      const name = displayName(me) ?? 'The organisers';
      this.emit({
        userIds: teamUsers,
        eventId,
        title: status === HackathonHelpQueryStatus.ACKNOWLEDGED ? `${name} is on your ${query.topicName} query` : `Your ${query.topicName} query is resolved`,
        body: query.message.slice(0, 180),
        deepLink: `unifesto://hackathon/${eventId}/help`,
      });
    }
    return this.inbox(userId, eventId);
  }

  /**
   * D27: hand a query to the organisers as a Space-desk HELP case, in the
   * team member's words with team, room and topic attached. The query stays on
   * the desk (it can still be resolved here). One case per query.
   */
  async escalate(userId: string, eventId: string, queryId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    const query = await this.prisma.hackathonHelpQuery.findFirst({
      where: { id: queryId, leaderboardId: board.id },
      include: { entrant: { select: { teamCode: true, name: true } } },
    });
    if (!query) throw new NotFoundException('Query not found');
    const manager = await this.leaderboard.canManage(userId, eventId);
    if (!manager && !(query.notifiedUserIds.includes(userId) && (await this.isStaff(userId, eventId)))) {
      throw new ForbiddenException('This query wasn’t sent to you.');
    }
    if (query.caseId) return this.inbox(userId, eventId);

    const [event, me] = await Promise.all([
      this.prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { spaceId: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true } }),
    ]);
    const team = query.entrant.name ? `${query.entrant.name} (${query.entrant.teamCode})` : query.entrant.teamCode;
    const open: SubjectCaseOpen = {
      subjectType: 'HackathonHelpQuery',
      subjectId: query.id,
      requesterId: query.raisedBy,
      kind: SupportCaseKind.HELP,
      desk: SupportDesk.SPACE,
      spaceId: event.spaceId,
      eventId,
      subject: `Hackathon help: ${query.topicName} · ${team}`,
      message:
        `${query.message}\n\nTeam: ${team} · Room: ${query.roomName ?? 'not set'} · Topic: ${query.topicName}` +
        `\nEscalated from the help desk by ${displayName(me) ?? 'the event team'}.`,
      notify: true,
    };
    const caseId = (await this.events.emitAsync(SUBJECT_CASE_OPEN, open)).find((r): r is string => typeof r === 'string');
    if (!caseId) throw new ServiceUnavailableException("Couldn't reach the organisers. Try again.");
    await this.prisma.hackathonHelpQuery.update({ where: { id: queryId }, data: { caseId, escalatedAt: new Date() } });
    return this.inbox(userId, eventId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async myTeamOrThrow(userId: string, eventId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const mine = await this.teams.findMyTeam(board.id, eventId, userId);
    if (!mine) throw new NotFoundException("You're not on a team for this hackathon");
    if (mine.cancelledAt) throw new BadRequestException('This registration was cancelled.');
    const team = await this.prisma.leaderboardEntrant.findUniqueOrThrow({
      where: { id: mine.id },
      select: { id: true, teamCode: true, name: true, roomId: true },
    });
    return { board, team };
  }

  private async users(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    const rows = unique.length ? await this.prisma.user.findMany({ where: { id: { in: unique } }, select: USER_SELECT }) : [];
    return new Map(rows.map((u) => [u.id, u]));
  }

  private emit(e: HackathonHelpDeskEvent) {
    if (e.userIds.length) this.events.emit(NotificationEvents.HackathonHelpDesk, e);
  }

  private async findTopicOrThrow(leaderboardId: string, topicId: string) {
    const topic = await this.prisma.hackathonHelpTopic.findFirst({ where: { id: topicId, leaderboardId } });
    if (!topic) throw new NotFoundException('Topic not found');
    return topic;
  }

  private topicNameTaken(err: unknown, name: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new BadRequestException(`There's already a topic called ${name}.`);
    }
    return err;
  }
}
