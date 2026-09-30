import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { GroupSeatStatus, Prisma, RegistrationStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  COUNTS_AS_ATTENDING,
  IS_GROUP_BOOKING,
  IS_INDIVIDUAL_BOOKING,
} from '../common/attendance';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { HackathonUpdateEvent } from '../notifications/notifications.events';
import { LeaderboardService } from './leaderboard.service';
import {
  OPEN_EVAL_STATUSES,
  TEAM_CODE_RE,
  cleanName,
  effectiveStatus,
  compareTeams,
  formatTeamCode,
  planTeamImport,
  statementBlock,
  teamStage,
} from './hackathon.shared';
import type { ImportHackathonTeamsDto, UpdateHackathonTeamDto } from './dto/hackathon.dto';
import { TEAM_STATEMENT_SELECT, setByLabel, statementView } from './hackathon.views';

export { TEAM_STATEMENT_SELECT, setByLabel, statementView };

/** The board columns every hackathon path needs. */
const BOARD_SELECT = {
  id: true,
  eventId: true,
  isHackathon: true,
  enabled: true,
  teamCodePrefix: true,
  teamCodeDigits: true,
  teamCodeNext: true,
  teamNameFieldId: true,
  venueName: true,
  venueAddress: true,
  venueLat: true,
  venueLng: true,
  venueMapUrl: true,
  venueNotes: true,
  psMode: true,
  themeMode: true,
  psDeadline: true,
} satisfies Prisma.LeaderboardSelect;

export type HackathonBoard = Prisma.LeaderboardGetPayload<{ select: typeof BOARD_SELECT }>;

/** One person on a team, as the team and the curator see them (no contacts). */
export interface TeamMember {
  seat: number;
  name: string | null;
  isLead: boolean;
  /** Has an app account on this seat, so they can open the hackathon. */
  joined: boolean;
}

/** A member without their account id, which never leaves the server. */
const publicMember = (m: TeamMember): TeamMember => ({
  seat: m.seat,
  name: m.name,
  isLead: m.isLead,
  joined: m.joined,
});

/**
 * Hackathon teams: importing GROUP registrations as teams with curator-patterned
 * Team IDs, keeping cancellation in step with the registration, the curator's
 * team list/edits, and the team's own hub (docs/hackathon-mobile-plan.md).
 *
 * A team is a LeaderboardEntrant on a board with `isHackathon`. Its members are
 * never stored here: they are the registration's lead plus whoever has claimed
 * a seat, read live, so a seat handed to someone new changes who can see the
 * team the moment it is claimed.
 */
@Injectable()
export class HackathonTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly events: EventEmitter2,
  ) {}

  // ── Board ─────────────────────────────────────────────────────────────────

  /** The event's hackathon board, or 404 when the event doesn't run one. */
  async getBoardOrThrow(eventId: string): Promise<HackathonBoard> {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      select: BOARD_SELECT,
    });
    if (!board || !board.isHackathon) {
      throw new NotFoundException('Hackathon mode is not on for this event');
    }
    return board;
  }

  // ── Cancellation ──────────────────────────────────────────────────────────

  /**
   * Bring `cancelledAt` in line with each team's registration. Registrations
   * are cancelled from many places (the attendee, refunds, the organiser), so
   * rather than hook each one, every read that shows teams runs this first. A
   * cancelled team keeps its Team ID; a restored registration brings it back.
   */
  async syncCancellations(leaderboardId: string, entrantIds?: string[]): Promise<void> {
    const teams = await this.prisma.leaderboardEntrant.findMany({
      where: {
        leaderboardId,
        registrationId: { not: null },
        ...(entrantIds ? { id: { in: entrantIds } } : {}),
      },
      select: { id: true, registrationId: true, cancelledAt: true },
    });
    if (!teams.length) return;
    const regs = await this.prisma.eventRegistration.findMany({
      where: { id: { in: teams.map((t) => t.registrationId!) } },
      select: { id: true, status: true },
    });
    const status = new Map(regs.map((r) => [r.id, r.status]));
    const isCancelled = (regId: string) => {
      const s = status.get(regId);
      return !s || s === RegistrationStatus.CANCELLED; // a deleted registration counts too
    };
    const toCancel = teams.filter((t) => !t.cancelledAt && isCancelled(t.registrationId!));
    const toRestore = teams.filter((t) => t.cancelledAt && !isCancelled(t.registrationId!));
    if (toCancel.length) {
      await this.prisma.leaderboardEntrant.updateMany({
        where: { id: { in: toCancel.map((t) => t.id) } },
        data: { cancelledAt: new Date() },
      });
      // A cancelled team drops out of any queue it was in.
      await this.prisma.hackathonEvalRequest.updateMany({
        where: { entrantId: { in: toCancel.map((t) => t.id) }, status: { in: [...OPEN_EVAL_STATUSES] } },
        data: { status: 'CANCELLED', closedAt: new Date(), closedReason: 'TEAM_CANCELLED' },
      });
    }
    if (toRestore.length) {
      await this.prisma.leaderboardEntrant.updateMany({
        where: { id: { in: toRestore.map((t) => t.id) } },
        data: { cancelledAt: null },
      });
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  /**
   * Import the event's attending GROUP registrations as teams, each with the
   * next Team ID. Individual registrations are never imported, only counted so
   * the curator knows they were left out. Safe to re-run: registrations that
   * already have a team are skipped and new ones get the next numbers.
   */
  async importTeams(userId: string, eventId: string, dto: ImportHackathonTeamsDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.getBoardOrThrow(eventId);
    if (!board.enabled) throw new BadRequestException('Turn hackathon mode on first.');
    if (!board.teamCodePrefix) {
      throw new BadRequestException('Set the Team ID prefix in hackathon settings first.');
    }

    const scope: Prisma.EventRegistrationWhereInput = {
      eventId,
      ...COUNTS_AS_ATTENDING,
      ...(dto.ticketTypeIds?.length ? { ticketTypeId: { in: dto.ticketTypeIds } } : {}),
    };

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Serialise imports on this board: the counter and the "already has a
        // team" check must not interleave with a second curator's import.
        await tx.$queryRaw`SELECT id FROM leaderboards WHERE id = ${board.id}::uuid FOR UPDATE`;
        const fresh = await tx.leaderboard.findUniqueOrThrow({
          where: { id: board.id },
          select: { teamCodePrefix: true, teamCodeDigits: true, teamCodeNext: true, teamNameFieldId: true },
        });
        const groups = await tx.eventRegistration.findMany({
          where: { ...scope, ...IS_GROUP_BOOKING },
          orderBy: [{ registeredAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            formResponses: true,
            user: { select: { fullName: true, username: true } },
          },
        });
        const individuals = await tx.eventRegistration.count({
          where: { ...scope, ...IS_INDIVIDUAL_BOOKING },
        });
        const existing = await tx.leaderboardEntrant.findMany({
          where: { leaderboardId: board.id },
          select: { registrationId: true, teamCode: true },
        });
        const rounds = await tx.leaderboardRound.findMany({
          where: { leaderboardId: board.id },
          select: { id: true },
        });

        const plan = planTeamImport({
          candidates: groups.map((g) => ({
            registrationId: g.id,
            leadName: g.user.fullName || g.user.username,
            formResponses: g.formResponses,
          })),
          linkedRegistrationIds: new Set(
            existing.map((e) => e.registrationId).filter((id): id is string => !!id),
          ),
          usedCodes: new Set(existing.map((e) => e.teamCode).filter((c): c is string => !!c)),
          prefix: fresh.teamCodePrefix ?? board.teamCodePrefix!,
          digits: fresh.teamCodeDigits,
          next: fresh.teamCodeNext,
          teamNameFieldId: fresh.teamNameFieldId,
        });

        const created = plan.teams.map((t) => ({ ...t, id: crypto.randomUUID() }));
        if (created.length) {
          await tx.leaderboardEntrant.createMany({
            data: created.map((t) => ({
              id: t.id,
              leaderboardId: board.id,
              name: t.name,
              registrationId: t.registrationId,
              teamCode: t.teamCode,
              teamSeq: t.teamSeq,
              teamNameSource: t.nameSource,
            })),
          });
          // Every team gets a (PENDING) standing in every existing round, as
          // LeaderboardService.createEntrant does for hand-added entrants.
          if (rounds.length) {
            await tx.leaderboardEntrantRound.createMany({
              data: created.flatMap((t) => rounds.map((r) => ({ entrantId: t.id, roundId: r.id }))),
              skipDuplicates: true,
            });
          }
        }
        if (plan.next > fresh.teamCodeNext) {
          await tx.leaderboard.update({
            where: { id: board.id },
            data: { teamCodeNext: plan.next },
          });
        }
        return {
          created,
          skipped: plan.skipped,
          individuals,
          nextTeamCode: formatTeamCode(
            fresh.teamCodePrefix ?? board.teamCodePrefix!,
            fresh.teamCodeDigits,
            Math.max(plan.next, fresh.teamCodeNext),
          ),
        };
      },
      { timeout: 30_000 },
    );

    await this.notify(
      eventId,
      result.created.map((t) => ({ id: t.id, name: t.name, teamCode: t.teamCode })),
      'TEAM_ASSIGNED',
    );

    return {
      imported: result.created.length,
      alreadyImported: result.skipped,
      individualSkipped: result.individuals,
      nextTeamCode: result.nextTeamCode,
    };
  }

  // ── Curator: list / detail / edit ─────────────────────────────────────────

  async listTeams(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.getBoardOrThrow(eventId);
    await this.syncCancellations(board.id);

    const teams = await this.prisma.leaderboardEntrant.findMany({
      where: { leaderboardId: board.id },
      select: {
        id: true,
        teamCode: true,
        teamSeq: true,
        name: true,
        teamNameSource: true,
        cancelledAt: true,
        registrationId: true,
        room: { select: { id: true, name: true } },
        ...TEAM_STATEMENT_SELECT,
      },
    });
    const regIds = teams.map((t) => t.registrationId).filter((id): id is string => !!id);
    const [regs, joined] = regIds.length
      ? await Promise.all([
          this.prisma.eventRegistration.findMany({
            where: { id: { in: regIds } },
            select: { id: true, groupSize: true, user: { select: { fullName: true, username: true } } },
          }),
          this.prisma.groupSeat.groupBy({
            by: ['registrationId'],
            where: {
              registrationId: { in: regIds },
              status: GroupSeatStatus.CLAIMED,
              claimedByUserId: { not: null },
            },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const regById = new Map(regs.map((r) => [r.id, r]));
    const joinedByReg = new Map(joined.map((j) => [j.registrationId, j._count._all]));
    const eliminated = await this.eliminatedIds(board.id);

    return teams.sort(compareTeams).map((t) => {
      const reg = t.registrationId ? regById.get(t.registrationId) : undefined;
      const ps = statementView(t);
      return {
        id: t.id,
        teamCode: t.teamCode,
        name: t.name,
        nameSource: t.teamNameSource,
        stage: teamStage({ cancelled: !!t.cancelledAt, statementLockedAt: t.statementLockedAt, eliminated: eliminated.has(t.id) }),
        statement: ps
          ? {
              code: ps.code,
              title: ps.title,
              themeLabel: ps.themeLabel,
              locked: !!ps.lockedAt,
              changedAfterEval: !!ps.changedAfterEvalAt,
            }
          : null,
        cancelledAt: t.cancelledAt,
        room: t.room,
        registrationId: t.registrationId,
        leadName: reg ? reg.user.fullName || reg.user.username : null,
        groupSize: reg?.groupSize ?? null,
        // Seat 1 is the lead's, so a seatless (legacy) group still has its lead.
        joinedCount: t.registrationId ? Math.max(1, joinedByReg.get(t.registrationId) ?? 0) : 0,
      };
    });
  }

  async getTeam(userId: string, eventId: string, entrantId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.getBoardOrThrow(eventId);
    await this.syncCancellations(board.id, [entrantId]);
    const team = await this.findTeamOrThrow(board.id, entrantId);
    const members = team.registrationId ? await this.members(team.registrationId) : [];
    const ps = statementView(team);
    return {
      id: team.id,
      teamCode: team.teamCode,
      name: team.name,
      nameSource: team.teamNameSource,
      stage: teamStage({
        cancelled: !!team.cancelledAt,
        statementLockedAt: team.statementLockedAt,
        eliminated: (await this.eliminatedIds(board.id, [team.id])).has(team.id),
      }),
      cancelledAt: team.cancelledAt,
      room: team.room,
      registrationId: team.registrationId,
      members: members.map(publicMember),
      statement: ps ? { ...ps, setBy: setByLabel(team.statementSetBy, members) } : null,
    };
  }

  async updateTeam(userId: string, eventId: string, entrantId: string, dto: UpdateHackathonTeamDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.getBoardOrThrow(eventId);
    await this.syncCancellations(board.id, [entrantId]);
    const team = await this.findTeamOrThrow(board.id, entrantId);

    const data: Prisma.LeaderboardEntrantUncheckedUpdateInput = {};
    let teamCode = team.teamCode;
    let name = team.name;
    if (dto.teamCode !== undefined) {
      teamCode = dto.teamCode.trim();
      if (!TEAM_CODE_RE.test(teamCode)) {
        throw new BadRequestException(
          'Team IDs use letters, numbers, spaces and - _ / . # (up to 40), starting with a letter or number.',
        );
      }
      data.teamCode = teamCode;
    }
    if (dto.name !== undefined) {
      const cleaned = cleanName(dto.name);
      if (!cleaned) throw new BadRequestException('Give the team a name.');
      name = cleaned;
      data.name = name;
      data.teamNameSource = 'CURATOR';
    }
    let newRoom: { id: string; name: string } | null | undefined;
    if (dto.roomId !== undefined && dto.roomId !== (team.room?.id ?? null)) {
      if (dto.roomId === null) {
        newRoom = null;
      } else {
        if (team.cancelledAt) throw new BadRequestException('This team is cancelled.');
        newRoom = await this.assertRoomHasSpace(board.id, dto.roomId, team.id);
      }
      data.roomId = newRoom?.id ?? null;
    }

    try {
      await this.prisma.leaderboardEntrant.update({ where: { id: team.id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`${teamCode} is already another team's ID.`);
      }
      throw err;
    }

    if (newRoom !== undefined && !team.cancelledAt && board.enabled) {
      await this.notify(eventId, [{ id: team.id, name, teamCode }], newRoom ? 'ROOM_ASSIGNED' : 'ROOM_CLEARED', {
        roomName: newRoom?.name,
      });
    }
    return this.getTeam(userId, eventId, entrantId);
  }

  /** The room, if it's on this board and has a free place (cancelled teams don't count). */
  async assertRoomHasSpace(leaderboardId: string, roomId: string, exceptTeamId?: string) {
    const room = await this.prisma.hackathonRoom.findFirst({
      where: { id: roomId, leaderboardId },
      select: { id: true, name: true, capacity: true },
    });
    if (!room) throw new NotFoundException('Room not found');
    const occupied = await this.prisma.leaderboardEntrant.count({
      where: {
        roomId,
        cancelledAt: null,
        ...(exceptTeamId ? { id: { not: exceptTeamId } } : {}),
      },
    });
    if (occupied >= room.capacity) {
      throw new BadRequestException(
        `${room.name} is full (${occupied}/${room.capacity} teams). Raise its capacity or pick another room.`,
      );
    }
    return { id: room.id, name: room.name };
  }

  async findTeamOrThrow(leaderboardId: string, entrantId: string) {
    const team = await this.prisma.leaderboardEntrant.findFirst({
      where: { id: entrantId, leaderboardId },
      select: {
        id: true,
        teamCode: true,
        name: true,
        teamNameSource: true,
        cancelledAt: true,
        registrationId: true,
        room: { select: { id: true, name: true, location: true, notes: true } },
        ...TEAM_STATEMENT_SELECT,
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  /** The registration's lead (the person who booked the group). */
  async leadUserId(registrationId: string | null): Promise<string | null> {
    if (!registrationId) return null;
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { userId: true },
    });
    return reg?.userId ?? null;
  }

  // ── Members ───────────────────────────────────────────────────────────────

  /**
   * The team's people, one per seat (released seats left out). A seat counts as
   * joined only when an app account holds it; a lead-typed name with no
   * account is shown but can't open the hackathon yet.
   */
  async members(registrationId: string): Promise<(TeamMember & { userId: string | null })[]> {
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: { userId: true, user: { select: { fullName: true, username: true } } },
    });
    if (!reg) return [];
    const leadName = reg.user.fullName || reg.user.username || null;
    const seats = await this.prisma.groupSeat.findMany({
      where: { registrationId, status: { not: GroupSeatStatus.RELEASED } },
      orderBy: { seatIndex: 'asc' },
      select: {
        seatIndex: true,
        claimedByUserId: true,
        memberDetails: true,
        claimedBy: { select: { fullName: true, username: true } },
      },
    });
    if (!seats.length) return [{ seat: 1, name: leadName, isLead: true, joined: true, userId: reg.userId }];
    return seats.map((s) => {
      const isLead = s.seatIndex === 1 || s.claimedByUserId === reg.userId;
      const details = s.memberDetails && typeof s.memberDetails === 'object' && !Array.isArray(s.memberDetails)
        ? (s.memberDetails as Record<string, unknown>)
        : {};
      const typed = typeof details.name === 'string' ? cleanName(details.name, 200) : null;
      return {
        seat: s.seatIndex,
        name: s.claimedBy?.fullName || s.claimedBy?.username || typed || (isLead ? leadName : null),
        isLead,
        joined: !!s.claimedByUserId,
        userId: s.claimedByUserId,
      };
    });
  }

  // ── Team member: hub ──────────────────────────────────────────────────────

  /**
   * The signed-in user's team on this event's hackathon: the registration they
   * booked, or a group they hold a claimed seat in. Null when they're on none.
   */
  async findMyTeam(leaderboardId: string, eventId: string, userId: string) {
    const [myRegs, mySeats] = await Promise.all([
      this.prisma.eventRegistration.findMany({ where: { eventId, userId }, select: { id: true } }),
      this.prisma.groupSeat.findMany({
        where: { claimedByUserId: userId, status: GroupSeatStatus.CLAIMED, registration: { eventId } },
        select: { registrationId: true },
      }),
    ]);
    const regIds = [...new Set([...myRegs.map((r) => r.id), ...mySeats.map((s) => s.registrationId)])];
    if (!regIds.length) return null;
    const teams = await this.prisma.leaderboardEntrant.findMany({
      where: { leaderboardId, registrationId: { in: regIds } },
      select: { id: true },
    });
    if (!teams.length) return null;
    await this.syncCancellations(leaderboardId, teams.map((t) => t.id));
    const hydrated = await Promise.all(teams.map((t) => this.findTeamOrThrow(leaderboardId, t.id)));
    // A person on two teams (rare: booked one, joined another) sees the live one.
    return hydrated.sort((a, b) => Number(!!a.cancelledAt) - Number(!!b.cancelledAt))[0];
  }

  /**
   * Everything the team hub shows. Returns null when the event runs no
   * hackathon (or it's switched off), so the ticket screen can call this for any
   * event; `team` is null when the user isn't on a team. Never carries marks.
   */
  async getMyHub(userId: string, eventId: string) {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      select: {
        ...BOARD_SELECT,
        event: {
          select: {
            title: true,
            startDateTime: true,
            endDateTime: true,
            coverImageUrl: true,
            venueName: true,
            venueAddress: true,
            city: true,
            latitude: true,
            longitude: true,
          },
        },
      },
    });
    if (!board || !board.isHackathon || !board.enabled) return null;

    const team = await this.findMyTeam(board.id, eventId, userId);
    const [members, unreadCount, leadReg] = team?.registrationId
      ? await Promise.all([
          this.members(team.registrationId),
          this.unreadCount(userId, eventId),
          this.prisma.eventRegistration.findUnique({
            where: { id: team.registrationId },
            select: { userId: true },
          }),
        ])
      : [[], await this.unreadCount(userId, eventId), null];

    const ownVenue = !!(board.venueName || board.venueAddress || board.venueLat != null);
    const cancelled = !!team?.cancelledAt;
    const eliminated = team ? await this.eliminatedIds(board.id, [team.id]) : new Set<string>();
    const evaluation = team && !cancelled && team.statementLockedAt ? await this.evaluationSummary(board.id, team.id) : null;
    const ps = team ? statementView(team) : null;
    return {
      eventId,
      event: {
        title: board.event.title,
        startDateTime: board.event.startDateTime,
        endDateTime: board.event.endDateTime,
        coverImageUrl: board.event.coverImageUrl,
      },
      venue: ownVenue
        ? {
            name: board.venueName,
            address: board.venueAddress,
            lat: board.venueLat,
            lng: board.venueLng,
            mapUrl: board.venueMapUrl,
            notes: board.venueNotes,
          }
        : {
            name: board.event.venueName,
            address: board.event.venueAddress || board.event.city,
            lat: board.event.latitude,
            lng: board.event.longitude,
            mapUrl: board.venueMapUrl,
            notes: board.venueNotes,
          },
      team: team
        ? {
            id: team.id,
            teamCode: team.teamCode,
            name: team.name,
            nameSource: team.teamNameSource,
            stage: teamStage({ cancelled, statementLockedAt: team.statementLockedAt, eliminated: eliminated.has(team.id) }),
            isLead: leadReg?.userId === userId,
            // What the team chose (or was assigned). Only the team's own; no marks.
            statement: ps
              ? {
                  source: ps.source,
                  code: ps.code,
                  title: ps.title,
                  description: ps.description,
                  themeLabel: ps.themeLabel,
                  lockedAt: ps.lockedAt,
                  setBy: setByLabel(team.statementSetBy, members),
                }
              : null,
            // Why the team can't lock one in itself right now (null = it can).
            statementBlock: cancelled
              ? null
              : statementBlock({
                  psMode: board.psMode,
                  psDeadline: board.psDeadline,
                  lockedAt: team.statementLockedAt,
                  now: new Date(),
                }),
            room: cancelled ? null : team.room ? { name: team.room.name, location: team.room.location, notes: team.room.notes } : null,
            members: members.map((m) => ({ ...publicMember(m), isMe: m.userId === userId })),
            // Open rounds and where the team is in a queue (no marks).
            evaluation,
          }
        : null,
      problemStatements: { mode: board.psMode, themeMode: board.themeMode, deadline: board.psDeadline },
      unreadCount,
    };
  }

  /** The team lead names the team (any time; the curator can still override). */
  async renameMyTeam(userId: string, eventId: string, rawName: string) {
    const board = await this.getBoardOrThrow(eventId);
    if (!board.enabled) throw new NotFoundException('Hackathon mode is not on for this event');
    const team = await this.findMyTeam(board.id, eventId, userId);
    if (!team?.registrationId) throw new NotFoundException("You're not on a team for this hackathon");
    const reg = await this.prisma.eventRegistration.findUnique({
      where: { id: team.registrationId },
      select: { userId: true },
    });
    if (reg?.userId !== userId) throw new BadRequestException('Only the team lead can rename the team.');
    if (team.cancelledAt) throw new BadRequestException('This registration was cancelled.');
    const name = cleanName(rawName);
    if (!name) throw new BadRequestException('Give the team a name.');
    await this.prisma.leaderboardEntrant.update({
      where: { id: team.id },
      data: { name, teamNameSource: 'LEAD' },
    });
    return { name };
  }

  /** Teams eliminated in any round: their run has ended. */
  async eliminatedIds(leaderboardId: string, entrantIds?: string[]): Promise<Set<string>> {
    const rows = await this.prisma.leaderboardEntrantRound.findMany({
      where: {
        status: 'ELIMINATED',
        round: { leaderboardId },
        ...(entrantIds ? { entrantId: { in: entrantIds } } : {}),
      },
      select: { entrantId: true },
    });
    return new Set(rows.map((r) => r.entrantId));
  }

  /** For the hub: how many rounds are open, and the team's place in a queue if it's in one. */
  private async evaluationSummary(leaderboardId: string, entrantId: string) {
    const [openRounds, request] = await Promise.all([
      this.prisma.leaderboardRound.count({ where: { leaderboardId, status: 'ACTIVE' } }),
      this.prisma.hackathonEvalRequest.findFirst({
        where: { entrantId, status: { in: [...OPEN_EVAL_STATUSES] } },
        select: {
          id: true,
          status: true,
          slotEndsAt: true,
          requestedAt: true,
          judgeUserId: true,
          panelId: true,
          round: { select: { name: true } },
          panel: { select: { name: true } },
        },
      }),
    ]);
    let position: number | null = null;
    let evaluatorName: string | null = request?.panel?.name ?? null;
    if (request?.judgeUserId) {
      const judge = await this.prisma.user.findUnique({
        where: { id: request.judgeUserId },
        select: { fullName: true, username: true },
      });
      evaluatorName = judge?.fullName || judge?.username || null;
    }
    if (request?.status === 'WAITING') {
      position =
        1 +
        (await this.prisma.hackathonEvalRequest.count({
          where: {
            ...(request.judgeUserId ? { judgeUserId: request.judgeUserId } : { panelId: request.panelId }),
            status: 'WAITING',
            OR: [{ requestedAt: { lt: request.requestedAt } }, { requestedAt: request.requestedAt, id: { lt: request.id } }],
          },
        }));
    }
    return {
      openRounds,
      request: request
        ? {
            status: effectiveStatus(request, new Date()),
            position,
            roundName: request.round.name,
            evaluatorName,
          }
        : null,
    };
  }

  private unreadCount(userId: string, eventId: string) {
    return this.prisma.userNotification.count({ where: { userId, eventId, readAt: null } });
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  /**
   * One push + in-app notice per team. Best-effort: never fails the write.
   * `exceptUserId` leaves out the person who made the change (they know).
   */
  async notify(
    eventId: string,
    teams: { id: string; name: string; teamCode: string | null }[],
    kind: HackathonUpdateEvent['kind'],
    extra: Pick<
      HackathonUpdateEvent,
      'roomName' | 'statementTitle' | 'roundName' | 'evaluatorName' | 'location' | 'meetingUrl' | 'awardTitle'
    > & {
      exceptUserId?: string;
    } = {},
  ) {
    if (!teams.length) return;
    try {
      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      if (!event) return;
      const people = await this.leaderboard.teamUserIds(teams.map((t) => t.id));
      for (const t of teams) {
        const userIds = (people.get(t.id) ?? []).filter((id) => id !== extra.exceptUserId);
        if (!userIds.length) continue;
        this.events.emit(NotificationEvents.HackathonUpdate, {
          userIds,
          eventId,
          eventTitle: event.title,
          kind,
          teamCode: t.teamCode,
          teamName: t.name,
          roomName: extra.roomName ?? null,
          statementTitle: extra.statementTitle ?? null,
          roundName: extra.roundName ?? null,
          evaluatorName: extra.evaluatorName ?? null,
          location: extra.location ?? null,
          meetingUrl: extra.meetingUrl ?? null,
          awardTitle: extra.awardTitle ?? null,
        } satisfies HackathonUpdateEvent);
      }
    } catch {
      // Notifications are a side effect; the curator's change already landed.
    }
  }
}
