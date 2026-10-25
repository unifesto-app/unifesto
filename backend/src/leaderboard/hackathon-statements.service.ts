import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { HackathonTeamsService, type HackathonBoard } from './hackathon-teams.service';
import {
  STATEMENT_CODE_RE,
  STATEMENT_TEXT_MAX,
  STATEMENT_TITLE_MAX,
  cleanName,
  compareTeams,
  deadlineReminderDue,
  nextStatementCode,
  placesLeft,
  resolveTheme,
  statementBlock,
} from './hackathon.shared';
import type {
  CreateHackathonStatementDto,
  CreateHackathonThemeDto,
  SetTeamStatementDto,
  UpdateHackathonStatementDto,
  UpdateHackathonThemeDto,
} from './dto/hackathon.dto';

/** Trimmed text, or null when nothing is left. Keeps line breaks (unlike cleanName). */
const cleanText = (raw: string | null | undefined, max: number): string | null => {
  const s = (raw ?? '').replace(/\r\n/g, '\n').trim();
  return s ? s.slice(0, max) : null;
};

/** Who is setting the statement, which decides what they're allowed to do. */
type Actor = { kind: 'TEAM'; userId: string } | { kind: 'CURATOR'; userId: string };

/**
 * Problem statements and themes (docs/hackathon-mobile-plan.md §2 #7–#10):
 * the curator's theme and statement lists, the team lead locking theirs in
 * (written or picked, depending on the board's mode), the curator assigning or
 * reopening one, the optional deadline and its reminder.
 *
 * A team's statement is the gate to the rest of the hackathon: until it is
 * locked (`statementLockedAt`) the team is NEEDS_PS and can't be judged.
 */
@Injectable()
export class HackathonStatementsService {
  private readonly logger = new Logger(HackathonStatementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
  ) {}

  // ── Curator: themes ───────────────────────────────────────────────────────

  async listThemes(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const themes = await this.prisma.hackathonTheme.findMany({
      where: { leaderboardId: board.id },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        order: true,
        _count: { select: { statements: true, teams: { where: { cancelledAt: null } } } },
      },
    });
    return themes.map((t) => ({
      id: t.id,
      name: t.name,
      order: t.order,
      statements: t._count.statements,
      teams: t._count.teams,
    }));
  }

  async createTheme(userId: string, eventId: string, dto: CreateHackathonThemeDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const name = cleanName(dto.name, 60);
    if (!name) throw new BadRequestException('Name the theme, like "HealthTech".');
    const last = await this.prisma.hackathonTheme.findFirst({
      where: { leaderboardId: board.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    try {
      return await this.prisma.hackathonTheme.create({
        data: { leaderboardId: board.id, name, order: dto.order ?? (last ? last.order + 1 : 0) },
        select: { id: true, name: true, order: true },
      });
    } catch (err) {
      throw this.taken(err, `There's already a theme called ${name}.`);
    }
  }

  async updateTheme(userId: string, eventId: string, themeId: string, dto: UpdateHackathonThemeDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.findThemeOrThrow(board.id, themeId);
    const name = dto.name !== undefined ? cleanName(dto.name, 60) : undefined;
    if (name === null) throw new BadRequestException('Name the theme.');
    try {
      return await this.prisma.hackathonTheme.update({
        where: { id: themeId },
        data: { ...(name ? { name } : {}), ...(dto.order !== undefined ? { order: dto.order } : {}) },
        select: { id: true, name: true, order: true },
      });
    } catch (err) {
      throw this.taken(err, `There's already a theme called ${name}.`);
    }
  }

  /**
   * Delete a theme no active team is using. Statements with it lose their
   * theme (their teams then pick one). Cancelled teams just drop it.
   */
  async deleteTheme(userId: string, eventId: string, themeId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const theme = await this.findThemeOrThrow(board.id, themeId);
    await this.teams.syncCancellations(board.id);
    const inUse = await this.prisma.leaderboardEntrant.count({ where: { themeId, cancelledAt: null } });
    if (inUse > 0) {
      throw new BadRequestException(
        `${inUse} team${inUse === 1 ? ' has' : 's have'} ${theme.name} as their theme. Change theirs first.`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.leaderboardEntrant.updateMany({ where: { themeId }, data: { themeId: null } }),
      this.prisma.hackathonTheme.delete({ where: { id: themeId } }),
    ]);
    return { ok: true };
  }

  // ── Curator: statements ───────────────────────────────────────────────────

  /** The list in order, each with how many teams took it and which ones. */
  async listStatements(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const [statements, ownCount] = await Promise.all([
      this.prisma.hackathonStatement.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          title: true,
          description: true,
          maxTeams: true,
          order: true,
          theme: { select: { id: true, name: true } },
          teams: {
            where: { cancelledAt: null },
            select: { id: true, teamCode: true, teamSeq: true, name: true, statementLockedAt: true },
          },
        },
      }),
      this.prisma.leaderboardEntrant.count({
        where: { leaderboardId: board.id, cancelledAt: null, statementId: null, customStatementTitle: { not: null } },
      }),
    ]);
    return {
      mode: board.psMode,
      themeMode: board.themeMode,
      deadline: board.psDeadline,
      nextCode: nextStatementCode(statements.map((s) => s.code)),
      /** Teams that wrote their own statement instead of taking one from the list. */
      ownStatements: ownCount,
      statements: statements.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description,
        theme: s.theme,
        maxTeams: s.maxTeams,
        order: s.order,
        taken: s.teams.length,
        placesLeft: placesLeft(s.maxTeams, s.teams.length),
        teams: s.teams.sort(compareTeams).map((t) => ({
          id: t.id,
          teamCode: t.teamCode,
          name: t.name,
          locked: !!t.statementLockedAt,
        })),
      })),
    };
  }

  async createStatement(userId: string, eventId: string, dto: CreateHackathonStatementDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const title = cleanName(dto.title, STATEMENT_TITLE_MAX);
    if (!title) throw new BadRequestException('Give the problem statement a title.');
    if (dto.themeId) await this.findThemeOrThrow(board.id, dto.themeId);

    const existing = await this.prisma.hackathonStatement.findMany({
      where: { leaderboardId: board.id },
      select: { code: true, order: true },
    });
    const code = cleanName(dto.code, 20) ?? nextStatementCode(existing.map((s) => s.code));
    this.assertCode(code);
    try {
      return await this.prisma.hackathonStatement.create({
        data: {
          leaderboardId: board.id,
          code,
          title,
          description: cleanText(dto.description, STATEMENT_TEXT_MAX) ?? '',
          themeId: dto.themeId ?? null,
          maxTeams: dto.maxTeams ?? null,
          order: dto.order ?? existing.reduce((max, s) => Math.max(max, s.order + 1), 0),
        },
      });
    } catch (err) {
      throw this.taken(err, `${code} is already another statement's code.`);
    }
  }

  async updateStatement(userId: string, eventId: string, statementId: string, dto: UpdateHackathonStatementDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const statement = await this.findStatementOrThrow(board.id, statementId);

    const data: Prisma.HackathonStatementUncheckedUpdateInput = {};
    if (dto.code !== undefined) {
      const code = cleanName(dto.code, 20);
      if (!code) throw new BadRequestException('A statement needs a code.');
      this.assertCode(code);
      data.code = code;
    }
    if (dto.title !== undefined) {
      const title = cleanName(dto.title, STATEMENT_TITLE_MAX);
      if (!title) throw new BadRequestException('Give the problem statement a title.');
      data.title = title;
    }
    if (dto.description !== undefined) data.description = cleanText(dto.description, STATEMENT_TEXT_MAX) ?? '';
    if (dto.themeId !== undefined && dto.themeId !== statement.themeId) {
      if (dto.themeId) await this.findThemeOrThrow(board.id, dto.themeId);
      data.themeId = dto.themeId;
    }
    if (dto.maxTeams !== undefined) {
      if (dto.maxTeams !== null) {
        await this.teams.syncCancellations(board.id);
        const taken = await this.prisma.leaderboardEntrant.count({ where: { statementId, cancelledAt: null } });
        if (dto.maxTeams < taken) {
          throw new BadRequestException(
            `${taken} team${taken === 1 ? ' already has' : 's already have'} ${statement.code}. The limit can't go below ${taken}.`,
          );
        }
      }
      data.maxTeams = dto.maxTeams;
    }
    if (dto.order !== undefined) data.order = dto.order;

    try {
      return await this.prisma.hackathonStatement.update({ where: { id: statementId }, data });
    } catch (err) {
      throw this.taken(err, `${String(data.code ?? statement.code)} is already another statement's code.`);
    }
  }

  /** Delete a statement no active team has. Cancelled teams just drop it. */
  async deleteStatement(userId: string, eventId: string, statementId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const statement = await this.findStatementOrThrow(board.id, statementId);
    await this.teams.syncCancellations(board.id);
    const taken = await this.prisma.leaderboardEntrant.count({ where: { statementId, cancelledAt: null } });
    if (taken > 0) {
      throw new BadRequestException(
        `${taken} team${taken === 1 ? ' has' : 's have'} ${statement.code}. Give ${taken === 1 ? 'it' : 'them'} another statement first.`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.leaderboardEntrant.updateMany({ where: { statementId }, data: { statementId: null } }),
      this.prisma.hackathonStatement.delete({ where: { id: statementId } }),
    ]);
    return { ok: true };
  }

  // ── Curator: a team's statement ───────────────────────────────────────────

  /**
   * Assign (or change) a team's statement and theme, in any mode and after
   * the deadline. It is locked straight away. If the team already had a
   * submitted evaluation, its marks are kept and flagged "changed after
   * evaluation" for the curator.
   */
  async assignStatement(userId: string, eventId: string, entrantId: string, dto: SetTeamStatementDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id, [entrantId]);
    const team = await this.teams.findTeamOrThrow(board.id, entrantId);
    if (team.cancelledAt) throw new BadRequestException('This team is cancelled.');

    const { title, changed } = await this.writeStatement(board, team.id, dto, { kind: 'CURATOR', userId });
    if (board.enabled && changed) {
      await this.teams.notify(eventId, [team], 'STATEMENT_ASSIGNED', { statementTitle: title });
    }
    return this.teams.getTeam(userId, eventId, entrantId);
  }

  /**
   * Reopen a team's statement so it can choose again: clears the statement
   * and theme (freeing its place on a limited statement) and the lock. Until
   * it locks one in again the team is back to NEEDS_PS.
   */
  async unlockStatement(userId: string, eventId: string, entrantId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const team = await this.teams.findTeamOrThrow(board.id, entrantId);
    if (!team.statementLockedAt && !team.statementId && !team.customStatementTitle) {
      return this.teams.getTeam(userId, eventId, entrantId);
    }
    // The team picks again itself after this, so flag a change after
    // evaluation here: once it relocks, the curator path never sees it.
    const evaluated = await this.prisma.leaderboardJudgment.count({ where: { entrantId: team.id, submittedAt: { not: null } } });
    await this.prisma.leaderboardEntrant.update({
      where: { id: team.id },
      data: {
        ...(evaluated ? { statementChangedAfterEvalAt: new Date() } : {}),
        statementId: null,
        customStatementTitle: null,
        customStatementText: null,
        themeId: null,
        themeText: null,
        statementLockedAt: null,
        statementSetBy: null,
      },
    });
    if (board.enabled && !team.cancelledAt) {
      await this.teams.notify(eventId, [team], 'STATEMENT_UNLOCKED');
    }
    return this.teams.getTeam(userId, eventId, entrantId);
  }

  // ── Team ──────────────────────────────────────────────────────────────────

  /**
   * What the team's statement screen needs: the mode, deadline, whether this
   * person can lock one in (the lead, while the window is open), the themes
   * and — when teams pick — the list with places left. Other teams' choices
   * are only visible as "full".
   */
  async getMyOptions(userId: string, eventId: string) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    const [leadId, themes, statements] = await Promise.all([
      this.teams.leadUserId(team.registrationId),
      this.prisma.hackathonTheme.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      }),
      board.psMode === 'TEAM_PICKS'
        ? this.prisma.hackathonStatement.findMany({
            where: { leaderboardId: board.id },
            orderBy: [{ order: 'asc' }, { code: 'asc' }],
            select: {
              id: true,
              code: true,
              title: true,
              description: true,
              maxTeams: true,
              theme: { select: { id: true, name: true } },
              _count: { select: { teams: { where: { cancelledAt: null } } } },
            },
          })
        : Promise.resolve([]),
    ]);
    const block = team.cancelledAt
      ? null
      : statementBlock({ psMode: board.psMode, psDeadline: board.psDeadline, lockedAt: team.statementLockedAt, now: new Date() });
    return {
      mode: board.psMode,
      themeMode: board.themeMode,
      deadline: board.psDeadline,
      cancelled: !!team.cancelledAt,
      block,
      isLead: leadId === userId,
      themes,
      statements: statements.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        description: s.description,
        theme: s.theme,
        placesLeft: placesLeft(s.maxTeams, s._count.teams),
      })),
    };
  }

  /** The team lead locks in the team's statement (and theme). One go: it can't be changed after. */
  async lockMyStatement(userId: string, eventId: string, dto: SetTeamStatementDto) {
    const { board, team } = await this.myTeamOrThrow(userId, eventId);
    if (team.cancelledAt) throw new BadRequestException('This registration was cancelled.');
    const leadId = await this.teams.leadUserId(team.registrationId);
    if (leadId !== userId) {
      throw new ForbiddenException('Only your team lead can lock in the problem statement.');
    }
    const { title } = await this.writeStatement(board, team.id, dto, { kind: 'TEAM', userId });
    await this.teams.notify(eventId, [team], 'STATEMENT_LOCKED', { statementTitle: title, exceptUserId: userId });
    return this.teams.getMyHub(userId, eventId);
  }

  private async myTeamOrThrow(userId: string, eventId: string) {
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const team = await this.teams.findMyTeam(board.id, eventId, userId);
    if (!team) throw new NotFoundException("You're not on a team for this hackathon");
    return { board, team };
  }

  // ── Writing a statement (team or curator) ─────────────────────────────────

  /**
   * Validate and write a team's statement + theme and lock it, in one
   * transaction. Returns the statement's title for the notification, and
   * whether anything changed (a curator re-saving the same choice doesn't).
   *
   * - Team: only the way the board's mode allows (write own / pick from the
   *   list), only before the deadline, and only if not already locked — the
   *   `statementLockedAt: null` guard makes a double tap or two members at once
   *   land exactly one lock.
   * - Curator: either way, any time.
   * - A limited statement is locked `FOR UPDATE` while its teams are counted,
   *   so two teams can't take its last place together.
   */
  private async writeStatement(board: HackathonBoard, entrantId: string, dto: SetTeamStatementDto, actor: Actor) {
    const picked = !!dto.statementId;
    const ownTitle = cleanName(dto.title, STATEMENT_TITLE_MAX);
    const ownText = cleanText(dto.description, STATEMENT_TEXT_MAX);
    if (picked && (ownTitle || ownText)) {
      throw new BadRequestException('Pick a statement from the list or write your own, not both.');
    }

    if (actor.kind === 'TEAM') {
      const block = statementBlock({ psMode: board.psMode, psDeadline: board.psDeadline, lockedAt: null, now: new Date() });
      if (block === 'NOT_OPEN') throw new BadRequestException("Problem statements aren't open yet.");
      if (block === 'CURATOR_ASSIGNS') throw new ForbiddenException('The organisers assign problem statements for this hackathon.');
      if (block === 'DEADLINE_PASSED') {
        throw new BadRequestException('The deadline to choose has passed. The organisers will assign your statement.');
      }
      if (board.psMode === 'TEAM_PICKS' && !picked) throw new BadRequestException('Pick a problem statement from the list.');
      if (board.psMode === 'TEAM_WRITES' && picked) throw new BadRequestException('Write your own problem statement for this hackathon.');
    }
    if (!picked) {
      if (!ownTitle) throw new BadRequestException('Give your problem statement a title.');
      if (!ownText) throw new BadRequestException('Describe the problem you will solve.');
    }

    const themes = await this.prisma.hackathonTheme.findMany({
      where: { leaderboardId: board.id },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.leaderboardEntrant.findUniqueOrThrow({
        where: { id: entrantId },
        select: {
          statementId: true,
          customStatementTitle: true,
          customStatementText: true,
          themeId: true,
          themeText: true,
          statementLockedAt: true,
        },
      });
      if (actor.kind === 'TEAM' && before.statementLockedAt) {
        throw new ConflictException('Your team already locked in its problem statement.');
      }

      let statement: { id: string; code: string; title: string; themeId: string | null; maxTeams: number | null } | null = null;
      if (picked) {
        await tx.$queryRaw`SELECT id FROM hackathon_statements WHERE id = ${dto.statementId}::uuid FOR UPDATE`;
        statement = await tx.hackathonStatement.findFirst({
          where: { id: dto.statementId!, leaderboardId: board.id },
          select: { id: true, code: true, title: true, themeId: true, maxTeams: true },
        });
        if (!statement) throw new NotFoundException('That problem statement is no longer on the list.');
        if (statement.maxTeams != null && before.statementId !== statement.id) {
          const taken = await tx.leaderboardEntrant.count({
            where: { statementId: statement.id, cancelledAt: null, id: { not: entrantId } },
          });
          if (taken >= statement.maxTeams) {
            throw new ConflictException(
              actor.kind === 'CURATOR'
                ? `${statement.code} is full (${taken}/${statement.maxTeams} teams). Raise its limit first.`
                : `${statement.code} just filled up. Pick another one.`,
            );
          }
        }
      }

      const theme = resolveTheme({
        themeMode: board.themeMode,
        themeIds: new Set(themes.map((t) => t.id)),
        statementThemeId: statement?.themeId ?? null,
        themeId: dto.themeId,
        themeText: dto.themeText,
      });
      if ('error' in theme) throw new BadRequestException(theme.error);

      const next = {
        statementId: statement?.id ?? null,
        customStatementTitle: statement ? null : ownTitle,
        customStatementText: statement ? null : ownText,
        themeId: theme.themeId,
        themeText: theme.themeText,
      };
      const changed =
        before.statementId !== next.statementId ||
        before.customStatementTitle !== next.customStatementTitle ||
        before.customStatementText !== next.customStatementText ||
        before.themeId !== next.themeId ||
        before.themeText !== next.themeText;

      // A curator changing the statement of a team that was already evaluated:
      // marks stay, the results flag it.
      let changedAfterEval: Date | undefined;
      if (actor.kind === 'CURATOR' && changed && before.statementLockedAt) {
        const evaluated = await tx.leaderboardJudgment.count({ where: { entrantId, submittedAt: { not: null } } });
        if (evaluated > 0) changedAfterEval = new Date();
      }

      const relock = changed || !before.statementLockedAt;
      const res = await tx.leaderboardEntrant.updateMany({
        where: { id: entrantId, ...(actor.kind === 'TEAM' ? { statementLockedAt: null } : {}) },
        data: {
          ...next,
          ...(relock ? { statementLockedAt: new Date(), statementSetBy: actor.userId } : {}),
          ...(changedAfterEval ? { statementChangedAfterEvalAt: changedAfterEval } : {}),
        },
      });
      if (res.count === 0) throw new ConflictException('Your team already locked in its problem statement.');
      return { title: statement?.title ?? ownTitle!, changed: relock };
    });
  }

  // ── Deadline reminder ─────────────────────────────────────────────────────

  /**
   * Every 5 minutes: an hour before a statement deadline, remind the teams
   * that haven't locked one in yet. Sent once per deadline value, so moving
   * the deadline re-arms it.
   */
  @Cron('*/5 * * * *')
  async remindDeadlines(now = new Date()): Promise<void> {
    try {
      const boards = await this.prisma.leaderboard.findMany({
        where: {
          isHackathon: true,
          enabled: true,
          psMode: { in: ['TEAM_WRITES', 'TEAM_PICKS'] },
          psDeadline: { gt: now, lte: new Date(now.getTime() + 60 * 60 * 1000) },
        },
        select: { id: true, eventId: true, psMode: true, psDeadline: true, psDeadlineRemindedFor: true },
      });
      for (const b of boards) {
        if (!deadlineReminderDue({ psMode: b.psMode, psDeadline: b.psDeadline, remindedFor: b.psDeadlineRemindedFor, now })) {
          continue;
        }
        // Claim it first so a second instance of the backend doesn't send it too.
        const claimed = await this.prisma.leaderboard.updateMany({
          where: {
            id: b.id,
            psDeadline: b.psDeadline,
            OR: [{ psDeadlineRemindedFor: null }, { psDeadlineRemindedFor: { not: b.psDeadline! } }],
          },
          data: { psDeadlineRemindedFor: b.psDeadline },
        });
        if (claimed.count === 0) continue;
        await this.teams.syncCancellations(b.id);
        const waiting = await this.prisma.leaderboardEntrant.findMany({
          where: { leaderboardId: b.id, cancelledAt: null, statementLockedAt: null },
          select: { id: true, name: true, teamCode: true },
        });
        await this.teams.notify(b.eventId, waiting, 'STATEMENT_DEADLINE');
      }
    } catch (err) {
      this.logger.warn(`Statement deadline reminders failed: ${(err as Error).message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private assertCode(code: string) {
    if (!STATEMENT_CODE_RE.test(code)) {
      throw new BadRequestException('Codes use letters, numbers and - _ / . # (up to 20), like PS-03.');
    }
  }

  private async findThemeOrThrow(leaderboardId: string, themeId: string) {
    const theme = await this.prisma.hackathonTheme.findFirst({ where: { id: themeId, leaderboardId } });
    if (!theme) throw new NotFoundException('Theme not found');
    return theme;
  }

  private async findStatementOrThrow(leaderboardId: string, statementId: string) {
    const statement = await this.prisma.hackathonStatement.findFirst({ where: { id: statementId, leaderboardId } });
    if (!statement) throw new NotFoundException('Problem statement not found');
    return statement;
  }

  private taken(err: unknown, message: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(message);
    }
    return err;
  }
}
