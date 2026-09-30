import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FormFieldType,
  LeaderboardRoundStatus,
  Prisma,
  TicketKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from './leaderboard.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import {
  TEAM_CODE_PREFIX_RE,
  compareTeams,
  formatTeamCode,
  planRoomAllocation,
} from './hackathon.shared';
import type {
  CreateHackathonRoomDto,
  UpdateHackathonConfigDto,
  UpdateHackathonRoomDto,
} from './dto/hackathon.dto';

/** '' and whitespace-only become null, so clearing a field in the app clears it here. */
const blankToNull = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : v.trim() || null;

/**
 * Hackathon setup for curators: turning hackathon mode on/off, its settings
 * (Team ID pattern, team-name question, venue) and rooms. Gated by
 * `event:manage-leaderboard` (Curator, Co-Curator, Space Admin) and the
 * space's plan (`hasLeaderboard`).
 */
@Injectable()
export class HackathonSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
  ) {}

  // ── Overview ──────────────────────────────────────────────────────────────

  /**
   * The curator's hackathon dashboard: whether it's on, its settings, headline
   * counts, and the choices the settings screen needs (per-group questions for
   * the team name, group ticket types for the import filter).
   */
  async getOverview(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const [event, board, planAllowed] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          title: true,
          venueName: true,
          venueAddress: true,
          city: true,
          latitude: true,
          longitude: true,
        },
      }),
      this.prisma.leaderboard.findUnique({ where: { eventId } }),
      this.leaderboard.planAllows(eventId),
    ]);
    if (!event) throw new NotFoundException('Event not found');

    const [teamNameFields, groupTicketTypes] = await Promise.all([
      this.prisma.eventFormField.findMany({
        where: { eventId, perGroup: true, type: FormFieldType.TEXT },
        orderBy: { order: 'asc' },
        select: { id: true, label: true, ticketType: { select: { name: true } } },
      }),
      this.prisma.eventTicketType.findMany({
        where: { eventId, kind: TicketKind.GROUP },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    const hackathon = board?.isHackathon ? board : null;
    let counts = { teams: 0, active: 0, cancelled: 0, unallocated: 0, rooms: 0 };
    if (hackathon) {
      await this.teams.syncCancellations(hackathon.id);
      const [teams, cancelled, unallocated, rooms] = await Promise.all([
        this.prisma.leaderboardEntrant.count({ where: { leaderboardId: hackathon.id } }),
        this.prisma.leaderboardEntrant.count({ where: { leaderboardId: hackathon.id, cancelledAt: { not: null } } }),
        this.prisma.leaderboardEntrant.count({ where: { leaderboardId: hackathon.id, cancelledAt: null, roomId: null } }),
        this.prisma.hackathonRoom.count({ where: { leaderboardId: hackathon.id } }),
      ]);
      counts = { teams, active: teams - cancelled, cancelled, unallocated, rooms };
    }

    return {
      eventId,
      eventTitle: event.title,
      planAllowed,
      // A leaderboard that isn't a hackathon blocks switching on only if it has entrants.
      otherBoard: board && !board.isHackathon ? { entrants: await this.prisma.leaderboardEntrant.count({ where: { leaderboardId: board.id } }) } : null,
      hackathon: hackathon
        ? {
            enabled: hackathon.enabled,
            teamCodePrefix: hackathon.teamCodePrefix,
            teamCodeDigits: hackathon.teamCodeDigits,
            teamCodeNext: hackathon.teamCodeNext,
            nextTeamCode: hackathon.teamCodePrefix
              ? formatTeamCode(hackathon.teamCodePrefix, hackathon.teamCodeDigits, hackathon.teamCodeNext)
              : null,
            teamNameFieldId: hackathon.teamNameFieldId,
            venue: {
              name: hackathon.venueName,
              address: hackathon.venueAddress,
              lat: hackathon.venueLat,
              lng: hackathon.venueLng,
              mapUrl: hackathon.venueMapUrl,
              notes: hackathon.venueNotes,
            },
          }
        : null,
      eventVenue: {
        name: event.venueName,
        address: event.venueAddress || event.city,
        lat: event.latitude,
        lng: event.longitude,
      },
      counts,
      teamNameFields: teamNameFields.map((f) => ({ id: f.id, label: f.label, ticketTypeName: f.ticketType?.name ?? null })),
      groupTicketTypes,
    };
  }

  // ── On / off ──────────────────────────────────────────────────────────────

  /**
   * Switch hackathon mode on. Creates the event's board (RUBRIC, teams) when it
   * has none, re-enables a switched-off hackathon with all its data, or turns
   * an unused non-hackathon board into one. Rounds start PENDING, so nothing is
   * judged until the curator opens a round.
   */
  async enable(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    if (!(await this.leaderboard.planAllows(eventId))) {
      throw new ForbiddenException("Hackathon mode isn't included in this space's plan. Ask an admin to enable it.");
    }
    const board = await this.prisma.leaderboard.findUnique({ where: { eventId } });

    if (!board) {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.leaderboard.create({
          data: {
            eventId,
            mode: 'RUBRIC',
            entrantKind: 'TEAM',
            visibility: 'PARTICIPANTS_ONLY',
            status: 'LIVE',
            enabled: true,
            isHackathon: true,
            createdBy: userId,
          },
        });
        await tx.leaderboardRound.create({
          data: { leaderboardId: created.id, name: 'Round 1', order: 1, status: LeaderboardRoundStatus.PENDING },
        });
      });
    } else if (!board.isHackathon) {
      const entrants = await this.prisma.leaderboardEntrant.count({ where: { leaderboardId: board.id } });
      if (entrants > 0) {
        throw new BadRequestException(
          'This event already has a leaderboard with entrants. Hackathon mode needs an event without one.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.leaderboard.update({
          where: { id: board.id },
          data: {
            isHackathon: true,
            mode: 'RUBRIC',
            entrantKind: 'TEAM',
            enabled: true,
            ...(board.status === 'DRAFT' ? { status: 'LIVE' as const } : {}),
          },
        }),
        // No entrants means nothing was judged; park its rounds until the curator opens one.
        this.prisma.leaderboardRound.updateMany({
          where: { leaderboardId: board.id, status: LeaderboardRoundStatus.ACTIVE },
          data: { status: LeaderboardRoundStatus.PENDING },
        }),
      ]);
    } else {
      await this.prisma.leaderboard.update({
        where: { id: board.id },
        data: { enabled: true, ...(board.status === 'DRAFT' ? { status: 'LIVE' as const } : {}) },
      });
    }
    return this.getOverview(userId, eventId);
  }

  /** Hide the hackathon from teams and judges. All data is kept; switch on to restore. */
  async disable(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const active = await this.prisma.leaderboardRound.count({
      where: { leaderboardId: board.id, status: LeaderboardRoundStatus.ACTIVE },
    });
    if (active > 0) throw new BadRequestException('Close the active round before switching hackathon mode off.');
    await this.prisma.leaderboard.update({ where: { id: board.id }, data: { enabled: false } });
    return this.getOverview(userId, eventId);
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  async updateConfig(userId: string, eventId: string, dto: UpdateHackathonConfigDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const data: Prisma.LeaderboardUpdateInput = {};

    if (dto.teamCodePrefix !== undefined) {
      const prefix = blankToNull(dto.teamCodePrefix);
      if (prefix && !TEAM_CODE_PREFIX_RE.test(prefix)) {
        throw new BadRequestException(
          'The prefix uses letters, numbers and - _ / . (up to 20), starting with a letter or number.',
        );
      }
      data.teamCodePrefix = prefix;
    }
    if (dto.teamCodeDigits !== undefined) data.teamCodeDigits = dto.teamCodeDigits;
    if (dto.teamCodeNext !== undefined && dto.teamCodeNext !== board.teamCodeNext) {
      // Moving the counter back could hand out a number that was already used.
      if (dto.teamCodeNext < board.teamCodeNext) {
        throw new BadRequestException(
          `The next number can only move forward (it's at ${board.teamCodeNext}), so no Team ID is ever reused.`,
        );
      }
      data.teamCodeNext = dto.teamCodeNext;
    }
    if (dto.teamNameFieldId !== undefined) {
      if (dto.teamNameFieldId) {
        const field = await this.prisma.eventFormField.findFirst({
          where: { id: dto.teamNameFieldId, eventId, perGroup: true, type: FormFieldType.TEXT },
          select: { id: true },
        });
        if (!field) throw new BadRequestException('Pick a text question asked once per group.');
      }
      data.teamNameFieldId = dto.teamNameFieldId ?? null;
    }
    if (dto.venueName !== undefined) data.venueName = blankToNull(dto.venueName);
    if (dto.venueAddress !== undefined) data.venueAddress = blankToNull(dto.venueAddress);
    if (dto.venueLat !== undefined) data.venueLat = dto.venueLat;
    if (dto.venueLng !== undefined) data.venueLng = dto.venueLng;
    if (dto.venueMapUrl !== undefined) data.venueMapUrl = blankToNull(dto.venueMapUrl);
    if (dto.venueNotes !== undefined) data.venueNotes = blankToNull(dto.venueNotes);

    if (Object.keys(data).length) {
      await this.prisma.leaderboard.update({ where: { id: board.id }, data });
    }
    return this.getOverview(userId, eventId);
  }

  // ── Rooms ─────────────────────────────────────────────────────────────────

  /** Rooms in order, each with the (non-cancelled) teams in it. */
  async listRooms(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);
    const [rooms, unallocated] = await Promise.all([
      this.prisma.hackathonRoom.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        include: {
          teams: {
            where: { cancelledAt: null },
            select: { id: true, teamCode: true, teamSeq: true, name: true },
          },
        },
      }),
      this.prisma.leaderboardEntrant.count({
        where: { leaderboardId: board.id, cancelledAt: null, roomId: null },
      }),
    ]);
    return {
      unallocated,
      rooms: rooms.map((r) => ({
        id: r.id,
        name: r.name,
        location: r.location,
        capacity: r.capacity,
        notes: r.notes,
        order: r.order,
        occupied: r.teams.length,
        teams: r.teams.sort(compareTeams).map((t) => ({ id: t.id, teamCode: t.teamCode, name: t.name })),
      })),
    };
  }

  async createRoom(userId: string, eventId: string, dto: CreateHackathonRoomDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const last = await this.prisma.hackathonRoom.findFirst({
      where: { leaderboardId: board.id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    try {
      return await this.prisma.hackathonRoom.create({
        data: {
          leaderboardId: board.id,
          name: dto.name.trim(),
          location: blankToNull(dto.location) ?? null,
          capacity: dto.capacity,
          notes: blankToNull(dto.notes) ?? null,
          order: dto.order ?? (last ? last.order + 1 : 0),
        },
      });
    } catch (err) {
      throw this.roomNameTaken(err, dto.name);
    }
  }

  async updateRoom(userId: string, eventId: string, roomId: string, dto: UpdateHackathonRoomDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const room = await this.findRoomOrThrow(board.id, roomId);
    if (dto.capacity !== undefined && dto.capacity < room.capacity) {
      await this.teams.syncCancellations(board.id);
      const occupied = await this.prisma.leaderboardEntrant.count({ where: { roomId, cancelledAt: null } });
      if (dto.capacity < occupied) {
        throw new BadRequestException(
          `${occupied} teams are in ${room.name}. Move some out before lowering its capacity below ${occupied}.`,
        );
      }
    }
    try {
      return await this.prisma.hackathonRoom.update({
        where: { id: roomId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.location !== undefined ? { location: blankToNull(dto.location) } : {}),
          ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
          ...(dto.notes !== undefined ? { notes: blankToNull(dto.notes) } : {}),
          ...(dto.order !== undefined ? { order: dto.order } : {}),
        },
      });
    } catch (err) {
      throw this.roomNameTaken(err, dto.name ?? room.name);
    }
  }

  async deleteRoom(userId: string, eventId: string, roomId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const room = await this.findRoomOrThrow(board.id, roomId);
    await this.teams.syncCancellations(board.id);
    const occupied = await this.prisma.leaderboardEntrant.count({ where: { roomId, cancelledAt: null } });
    if (occupied > 0) {
      throw new BadRequestException(`Move the ${occupied} team${occupied === 1 ? '' : 's'} out of ${room.name} first.`);
    }
    await this.prisma.hackathonRoom.delete({ where: { id: roomId } });
    return { ok: true };
  }

  /**
   * Put every team without a room into the rooms' free places, in Team ID
   * order and room order. Teams already in a room stay put; cancelled teams
   * are skipped. Each placed team is told its room.
   */
  async autoAllocate(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    await this.teams.syncCancellations(board.id);

    const rooms = await this.prisma.hackathonRoom.findMany({
      where: { leaderboardId: board.id },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, capacity: true, _count: { select: { teams: { where: { cancelledAt: null } } } } },
    });
    if (!rooms.length) throw new BadRequestException('Add a room first.');
    const waiting = await this.prisma.leaderboardEntrant.findMany({
      where: { leaderboardId: board.id, cancelledAt: null, roomId: null },
      select: { id: true, teamSeq: true, teamCode: true, name: true },
    });
    waiting.sort(compareTeams);

    const plan = planRoomAllocation(
      rooms.map((r) => ({ id: r.id, capacity: r.capacity, occupied: r._count.teams })),
      waiting.map((t) => t.id),
    );
    const byRoom = new Map<string, string[]>();
    for (const a of plan.assignments) byRoom.set(a.roomId, [...(byRoom.get(a.roomId) ?? []), a.teamId]);

    if (byRoom.size) {
      await this.prisma.$transaction(
        [...byRoom].map(([roomId, teamIds]) =>
          // `roomId: null` guards against a team a curator placed by hand meanwhile.
          this.prisma.leaderboardEntrant.updateMany({ where: { id: { in: teamIds }, roomId: null }, data: { roomId } }),
        ),
      );
    }

    if (board.enabled) {
      const teamById = new Map(waiting.map((t) => [t.id, t]));
      for (const [roomId, teamIds] of byRoom) {
        const room = rooms.find((r) => r.id === roomId)!;
        await this.teams.notify(
          eventId,
          teamIds.map((id) => teamById.get(id)!),
          'ROOM_ASSIGNED',
          room.name,
        );
      }
    }

    return {
      allocated: plan.assignments.length,
      unplaced: plan.unplaced.length,
      ...(await this.listRooms(userId, eventId)),
    };
  }

  private async findRoomOrThrow(leaderboardId: string, roomId: string) {
    const room = await this.prisma.hackathonRoom.findFirst({ where: { id: roomId, leaderboardId } });
    if (!room) throw new NotFoundException('Room not found');
    return room;
  }

  private roomNameTaken(err: unknown, name: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException(`There's already a room called ${name.trim()}.`);
    }
    return err;
  }
}
