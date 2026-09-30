import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeaderboardPanelistKind, Prisma, RoleCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { HackathonJudgeUpdateEvent } from '../notifications/notifications.events';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardGateway } from './leaderboard.gateway';
import { HackathonTeamsService } from './hackathon-teams.service';
import { OPEN_EVAL_STATUSES, SLOT_EVAL_STATUSES, cleanName, normalizeMobile } from './hackathon.shared';
import type {
  AddHackathonJudgeDto,
  CreateHackathonPanelDto,
  UpdateHackathonJudgeDto,
  UpdateHackathonPanelDto,
} from './dto/hackathon.dto';

/** '' and whitespace-only become null, so clearing a field in the app clears it here. */
const blankToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;

/** A placeholder account made for an invite by email has no real phone number. */
const isPlaceholderMobile = (m: string) => m.startsWith('+0') || m.startsWith('deleted-');

/**
 * Judges and panels on a hackathon (docs/hackathon-mobile-plan.md §2 #11–#14,
 * #23): the curator adds a judge by phone number or email (an existing account,
 * or a new one that becomes theirs when they sign in with it), sets the themes
 * they take, where teams find them and which rounds they judge, and groups
 * judges into panels for PANEL rounds.
 *
 * A judge (or mentor) is a LeaderboardPanelist row of their kind per round
 * scope, which also grants the event-scoped JUDGE / MENTOR role, plus one
 * HackathonJudgeProfile. Mentors take MENTORING rounds and give feedback only. Gated by
 * `event:manage-leaderboard`.
 */
@Injectable()
export class HackathonJudgesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    @Inject(forwardRef(() => LeaderboardGateway))
    private readonly gateway: LeaderboardGateway,
    private readonly events: EventEmitter2,
  ) {}

  // ── Judges ────────────────────────────────────────────────────────────────

  async listJudges(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.ensureProfiles(board.id);
    return this.judgeRows(board.id);
  }

  async getJudge(userId: string, eventId: string, judgeId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findProfileOrThrow(board.id, judgeId);
    const [row] = await this.judgeRows(board.id, judgeId);
    return row;
  }

  /**
   * Add a judge by phone number or email. Someone already judging here is
   * refused (edit them instead). They're told in the app that they're judging.
   */
  async addJudge(userId: string, eventId: string, dto: AddHackathonJudgeDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const name = cleanName(dto.name, 200) ?? '';

    let judgeUserId: string;
    if (dto.mobile?.trim()) {
      const mobile = normalizeMobile(dto.mobile);
      if (!mobile) throw new BadRequestException('Enter a valid phone number, like 98765 43210 or +44 7700 900123.');
      judgeUserId = await this.findOrCreateUserByMobile(mobile, name);
    } else if (dto.email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email.trim())) throw new BadRequestException('Enter a valid email address.');
      judgeUserId = await this.leaderboard.findOrCreateUserByEmail(dto.email, name);
    } else {
      throw new BadRequestException('Add the judge’s phone number or email.');
    }

    const existing = await this.prisma.hackathonJudgeProfile.findUnique({
      where: { leaderboardId_userId: { leaderboardId: board.id, userId: judgeUserId } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('They’re already a judge or mentor here. Open them in the list to make changes.');
    const kind = dto.kind ?? LeaderboardPanelistKind.JUDGE;

    const themeIds = await this.checkThemes(board.id, dto.themeIds);
    const roundIds = await this.checkRounds(board.id, dto.roundIds);
    const profile = await this.prisma.$transaction(async (tx) => {
      const created = await tx.hackathonJudgeProfile.create({
        data: {
          leaderboardId: board.id,
          userId: judgeUserId,
          kind,
          themeIds: themeIds ?? [],
          location: blankToNull(dto.location) ?? null,
          meetingUrl: blankToNull(dto.meetingUrl) ?? null,
        },
        select: { id: true },
      });
      await this.writeRoundScope(tx, board.id, judgeUserId, kind, roundIds ?? null);
      return created;
    });
    await this.leaderboard.grantPanelistRole(judgeUserId, eventId, kind, userId);

    if (board.enabled) await this.notifyJudges(eventId, [judgeUserId], kind === 'MENTOR' ? 'MENTOR_ADDED' : 'JUDGE_ADDED');
    return this.getJudge(userId, eventId, profile.id);
  }

  async updateJudge(userId: string, eventId: string, judgeId: string, dto: UpdateHackathonJudgeDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const profile = await this.findProfileOrThrow(board.id, judgeId);
    const themeIds = await this.checkThemes(board.id, dto.themeIds);
    const roundIds = dto.roundIds !== undefined ? await this.checkRounds(board.id, dto.roundIds) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.hackathonJudgeProfile.update({
        where: { id: profile.id },
        data: {
          ...(themeIds !== undefined ? { themeIds } : {}),
          ...(dto.location !== undefined ? { location: blankToNull(dto.location) } : {}),
          ...(dto.meetingUrl !== undefined ? { meetingUrl: blankToNull(dto.meetingUrl) } : {}),
          ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
        },
      });
      if (roundIds !== undefined) await this.writeRoundScope(tx, board.id, profile.userId, profile.kind, roundIds);
    });
    this.gateway.hackathonChanged(eventId, { judgeUserIds: [profile.userId] });
    return this.getJudge(userId, eventId, judgeId);
  }

  /**
   * Take someone off the judging. Refused while teams are in their queue (move
   * or remove them first). Marks they already gave are kept.
   */
  async removeJudge(userId: string, eventId: string, judgeId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const profile = await this.findProfileOrThrow(board.id, judgeId);
    const queued = await this.prisma.hackathonEvalRequest.count({
      where: { leaderboardId: board.id, judgeUserId: profile.userId, status: { in: [...OPEN_EVAL_STATUSES] } },
    });
    if (queued) {
      throw new BadRequestException(
        `${queued} team${queued === 1 ? ' is' : 's are'} in their queue. Move or remove ${queued === 1 ? 'it' : 'them'} from Live queues first.`,
      );
    }
    const busyPanel = await this.prisma.hackathonPanel.findFirst({
      where: {
        leaderboardId: board.id,
        members: { some: { userId: profile.userId } },
        evalRequests: { some: { status: { in: [...SLOT_EVAL_STATUSES] } } },
      },
      select: { name: true },
    });
    if (busyPanel) throw new BadRequestException(`${busyPanel.name} is evaluating a team right now. Try again after the slot.`);

    await this.prisma.$transaction([
      this.prisma.hackathonPanelMember.deleteMany({
        where: { userId: profile.userId, panel: { leaderboardId: board.id } },
      }),
      this.prisma.leaderboardPanelist.deleteMany({
        where: { leaderboardId: board.id, userId: profile.userId, kind: profile.kind },
      }),
      this.prisma.hackathonJudgeProfile.delete({ where: { id: profile.id } }),
    ]);
    // No other judging on this event: they lose the role and the Judging section.
    const role = await this.prisma.role.findUnique({
      where: { code: profile.kind === 'MENTOR' ? RoleCode.MENTOR : RoleCode.JUDGE },
      select: { id: true },
    });
    if (role) await this.prisma.userRole.deleteMany({ where: { userId: profile.userId, roleId: role.id, eventId } });
    this.gateway.hackathonChanged(eventId, { judgeUserIds: [profile.userId] });
    return { ok: true };
  }

  /**
   * Judges and mentors added the old way (a panelist row with no profile) get
   * a profile, so everyone on the board shows up and can take a queue.
   */
  private async ensureProfiles(leaderboardId: string) {
    const [rows, profiles] = await Promise.all([
      this.prisma.leaderboardPanelist.findMany({
        where: { leaderboardId },
        select: { userId: true, kind: true },
        orderBy: { kind: 'asc' },
      }),
      this.prisma.hackathonJudgeProfile.findMany({ where: { leaderboardId }, select: { userId: true } }),
    ]);
    const have = new Set(profiles.map((p) => p.userId));
    // One profile per person; someone with both kinds of rows counts as a judge.
    const missing = new Map<string, LeaderboardPanelistKind>();
    for (const r of rows) {
      if (have.has(r.userId)) continue;
      if (missing.get(r.userId) !== LeaderboardPanelistKind.JUDGE) missing.set(r.userId, r.kind);
    }
    if (missing.size) {
      await this.prisma.hackathonJudgeProfile.createMany({
        data: [...missing].map(([userId, kind]) => ({ leaderboardId, userId, kind, themeIds: [] })),
        skipDuplicates: true,
      });
    }
  }

  /** The judges list (or one judge) with names, themes, rounds, panels and their queue. */
  private async judgeRows(leaderboardId: string, onlyId?: string) {
    const profiles = await this.prisma.hackathonJudgeProfile.findMany({
      where: { leaderboardId, ...(onlyId ? { id: onlyId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    const userIds = profiles.map((p) => p.userId);
    if (!userIds.length) return [];
    const [users, scopes, themes, rounds, panelMembers, queue] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          fullName: true,
          username: true,
          mobileNumber: true,
          lastSeenAt: true,
          identities: { where: { email: { not: null } }, select: { email: true }, take: 1 },
        },
      }),
      this.prisma.leaderboardPanelist.findMany({
        where: { leaderboardId, userId: { in: userIds }, entrantId: null },
        select: { userId: true, roundId: true, kind: true },
      }),
      this.prisma.hackathonTheme.findMany({ where: { leaderboardId }, select: { id: true, name: true } }),
      this.prisma.leaderboardRound.findMany({ where: { leaderboardId }, orderBy: { order: 'asc' }, select: { id: true, name: true } }),
      this.prisma.hackathonPanelMember.findMany({
        where: { userId: { in: userIds }, panel: { leaderboardId } },
        select: { userId: true, panel: { select: { id: true, name: true } } },
      }),
      this.prisma.hackathonEvalRequest.groupBy({
        by: ['judgeUserId', 'status'],
        where: { leaderboardId, judgeUserId: { in: userIds }, status: { in: [...OPEN_EVAL_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const themeById = new Map(themes.map((t) => [t.id, t]));
    return profiles.map((p) => {
      const u = userById.get(p.userId);
      const mine = scopes.filter((s) => s.userId === p.userId && s.kind === p.kind);
      const allRounds = mine.length === 0 || mine.some((s) => s.roundId === null);
      const q = queue.filter((g) => g.judgeUserId === p.userId);
      return {
        id: p.id,
        userId: p.userId,
        kind: p.kind,
        name: u?.fullName || u?.username || null,
        // What the curator typed to add them: their email, or phone number.
        contact: u?.identities[0]?.email ?? (u && !isPlaceholderMobile(u.mobileNumber) ? u.mobileNumber : null),
        signedIn: !!u?.lastSeenAt,
        themes: p.themeIds.map((id) => themeById.get(id)).filter((t): t is { id: string; name: string } => !!t),
        location: p.location,
        meetingUrl: p.meetingUrl,
        isAvailable: p.isAvailable,
        rounds: allRounds ? null : rounds.filter((r) => mine.some((s) => s.roundId === r.id)),
        panels: panelMembers.filter((m) => m.userId === p.userId).map((m) => m.panel),
        queue: {
          waiting: q.filter((g) => g.status === 'WAITING').reduce((n, g) => n + g._count._all, 0),
          busy: q.some((g) => g.status !== 'WAITING'),
        },
      };
    });
  }

  /**
   * Find an account by phone number, or make one that becomes the judge's when
   * they sign in with that number (sign-in links an unverified account by number).
   */
  private async findOrCreateUserByMobile(mobile: string, name: string): Promise<string> {
    const existing = await this.prisma.user.findUnique({
      where: { mobileNumber: mobile },
      select: { id: true, fullName: true, deletedAt: true },
    });
    if (existing) {
      if (existing.deletedAt) throw new BadRequestException('That account was closed. Use another number or an email.');
      if (!existing.fullName && name) {
        await this.prisma.user.update({ where: { id: existing.id }, data: { fullName: name } }).catch(() => undefined);
      }
      return existing.id;
    }
    try {
      const user = await this.prisma.user.create({
        data: { mobileNumber: mobile, mobileVerified: false, fullName: name || null },
        select: { id: true },
      });
      return user.id;
    } catch (err) {
      // Someone signed up with it at the same moment.
      const raced = await this.prisma.user.findUnique({ where: { mobileNumber: mobile }, select: { id: true } });
      if (raced) return raced.id;
      throw err;
    }
  }

  /**
   * Replace the judge's round scope: one row with no round (every round), or
   * one per round. Rows scoped to a single team (added the old way) stay.
   */
  private async writeRoundScope(
    tx: Prisma.TransactionClient,
    leaderboardId: string,
    judgeUserId: string,
    kind: LeaderboardPanelistKind,
    roundIds: string[] | null,
  ) {
    await tx.leaderboardPanelist.deleteMany({
      where: { leaderboardId, userId: judgeUserId, kind, entrantId: null },
    });
    const scope = roundIds?.length ? roundIds : [null];
    await tx.leaderboardPanelist.createMany({
      data: scope.map((roundId) => ({ leaderboardId, userId: judgeUserId, kind, roundId })),
    });
  }

  private async checkThemes(leaderboardId: string, themeIds: string[] | undefined) {
    if (themeIds === undefined) return undefined;
    const unique = [...new Set(themeIds)];
    if (!unique.length) return [];
    const found = await this.prisma.hackathonTheme.count({ where: { leaderboardId, id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException('One of those themes is no longer on the list.');
    return unique;
  }

  private async checkRounds(leaderboardId: string, roundIds: string[] | null | undefined) {
    if (roundIds === undefined || roundIds === null) return roundIds;
    const unique = [...new Set(roundIds)];
    const found = await this.prisma.leaderboardRound.count({ where: { leaderboardId, id: { in: unique } } });
    if (found !== unique.length) throw new BadRequestException('One of those rounds no longer exists.');
    return unique;
  }

  private async findProfileOrThrow(leaderboardId: string, judgeId: string) {
    const profile = await this.prisma.hackathonJudgeProfile.findFirst({ where: { id: judgeId, leaderboardId } });
    if (!profile) throw new NotFoundException('Judge not found');
    return profile;
  }

  // ── Panels ────────────────────────────────────────────────────────────────

  async listPanels(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    return this.panelRows(board.id);
  }

  async createPanel(userId: string, eventId: string, dto: CreateHackathonPanelDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const name = cleanName(dto.name, 120);
    if (!name) throw new BadRequestException('Name the panel, like "Panel A".');
    if (dto.roundId) await this.checkRounds(board.id, [dto.roundId]);
    const members = await this.checkMembers(board.id, dto.memberUserIds ?? []);
    try {
      const panel = await this.prisma.hackathonPanel.create({
        data: {
          leaderboardId: board.id,
          name,
          roundId: dto.roundId ?? null,
          location: blankToNull(dto.location) ?? null,
          meetingUrl: blankToNull(dto.meetingUrl) ?? null,
          isAvailable: dto.isAvailable ?? true,
          members: { create: members.map((m) => ({ userId: m })) },
        },
        select: { id: true },
      });
      return (await this.panelRows(board.id, panel.id))[0];
    } catch (err) {
      throw this.panelNameTaken(err, name);
    }
  }

  async updatePanel(userId: string, eventId: string, panelId: string, dto: UpdateHackathonPanelDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const panel = await this.findPanelOrThrow(board.id, panelId);
    const name = dto.name !== undefined ? cleanName(dto.name, 120) : undefined;
    if (name === null) throw new BadRequestException('Name the panel.');
    if (dto.roundId) await this.checkRounds(board.id, [dto.roundId]);
    const members = dto.memberUserIds !== undefined ? await this.checkMembers(board.id, dto.memberUserIds) : undefined;
    if (members) {
      const busy = await this.prisma.hackathonEvalRequest.count({
        where: { panelId, status: { in: [...SLOT_EVAL_STATUSES] } },
      });
      if (busy) throw new BadRequestException('The panel is evaluating a team. Change who sits on it after the slot.');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.hackathonPanel.update({
          where: { id: panel.id },
          data: {
            ...(name ? { name } : {}),
            ...(dto.roundId !== undefined ? { roundId: dto.roundId } : {}),
            ...(dto.location !== undefined ? { location: blankToNull(dto.location) } : {}),
            ...(dto.meetingUrl !== undefined ? { meetingUrl: blankToNull(dto.meetingUrl) } : {}),
            ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
          },
        });
        if (members) {
          await tx.hackathonPanelMember.deleteMany({ where: { panelId } });
          if (members.length) await tx.hackathonPanelMember.createMany({ data: members.map((m) => ({ panelId, userId: m })) });
        }
      });
    } catch (err) {
      throw this.panelNameTaken(err, name ?? panel.name);
    }
    const row = (await this.panelRows(board.id, panel.id))[0];
    this.gateway.hackathonChanged(eventId, { judgeUserIds: row.members.map((m) => m.userId) });
    return row;
  }

  async deletePanel(userId: string, eventId: string, panelId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const panel = await this.findPanelOrThrow(board.id, panelId);
    const queued = await this.prisma.hackathonEvalRequest.count({
      where: { panelId, status: { in: [...OPEN_EVAL_STATUSES] } },
    });
    if (queued) {
      throw new BadRequestException(
        `${queued} team${queued === 1 ? ' is' : 's are'} in ${panel.name}'s queue. Move or remove ${queued === 1 ? 'it' : 'them'} first.`,
      );
    }
    await this.prisma.hackathonPanel.delete({ where: { id: panel.id } });
    return { ok: true };
  }

  private async panelRows(leaderboardId: string, onlyId?: string) {
    const panels = await this.prisma.hackathonPanel.findMany({
      where: { leaderboardId, ...(onlyId ? { id: onlyId } : {}) },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        location: true,
        meetingUrl: true,
        isAvailable: true,
        round: { select: { id: true, name: true } },
        members: { select: { userId: true } },
      },
    });
    const userIds = [...new Set(panels.flatMap((p) => p.members.map((m) => m.userId)))];
    const [users, queue] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, username: true } }),
      this.prisma.hackathonEvalRequest.groupBy({
        by: ['panelId', 'status'],
        where: { leaderboardId, panelId: { in: panels.map((p) => p.id) }, status: { in: [...OPEN_EVAL_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    return panels.map((p) => {
      const q = queue.filter((g) => g.panelId === p.id);
      return {
        id: p.id,
        name: p.name,
        round: p.round,
        location: p.location,
        meetingUrl: p.meetingUrl,
        isAvailable: p.isAvailable,
        members: p.members.map((m) => {
          const u = userById.get(m.userId);
          return { userId: m.userId, name: u?.fullName || u?.username || null };
        }),
        queue: {
          waiting: q.filter((g) => g.status === 'WAITING').reduce((n, g) => n + g._count._all, 0),
          busy: q.some((g) => g.status !== 'WAITING'),
        },
      };
    });
  }

  /** Panel members must be judges (not mentors) on this hackathon. */
  private async checkMembers(leaderboardId: string, userIds: string[]) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return [];
    const found = await this.prisma.hackathonJudgeProfile.count({
      where: { leaderboardId, userId: { in: unique }, kind: LeaderboardPanelistKind.JUDGE },
    });
    if (found !== unique.length) throw new BadRequestException('Add everyone on the panel as a judge first.');
    return unique;
  }

  private async findPanelOrThrow(leaderboardId: string, panelId: string) {
    const panel = await this.prisma.hackathonPanel.findFirst({ where: { id: panelId, leaderboardId } });
    if (!panel) throw new NotFoundException('Panel not found');
    return panel;
  }

  private panelNameTaken(err: unknown, name: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(`There's already a panel called ${name}.`);
    }
    return err;
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Push + in-app to judges. Best-effort: never fails the write. */
  async notifyJudges(
    eventId: string,
    userIds: string[],
    kind: HackathonJudgeUpdateEvent['kind'],
    extra: Pick<HackathonJudgeUpdateEvent, 'teamCode' | 'teamName' | 'roundName'> = {},
  ) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      if (!event) return;
      this.events.emit(NotificationEvents.HackathonJudgeUpdate, {
        userIds: ids,
        eventId,
        eventTitle: event.title,
        kind,
        ...extra,
      } satisfies HackathonJudgeUpdateEvent);
    } catch {
      // Notifications are a side effect.
    }
  }
}
