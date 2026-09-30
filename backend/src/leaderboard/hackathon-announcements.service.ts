import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEvents } from '../notifications/notifications.constants';
import type { HackathonAnnouncementEvent } from '../notifications/notifications.events';
import { LeaderboardService } from './leaderboard.service';
import { HackathonTeamsService } from './hackathon-teams.service';
import { cleanName } from './hackathon.shared';
import type { SendAnnouncementDto } from './dto/hackathon.dto';

/**
 * Curator announcements (docs/hackathon-mobile-plan.md §2 #22, §10): a message
 * to every team member and judge, only teams, only judges and mentors, or the
 * teams in one room. Sent as push + in-app (it lands in each person's updates
 * feed even with push off) and kept as a history for the curators.
 */
@Injectable()
export class HackathonAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly teams: HackathonTeamsService,
    private readonly events: EventEmitter2,
  ) {}

  async send(userId: string, eventId: string, dto: SendAnnouncementDto) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    if (!board.enabled) throw new BadRequestException('Turn hackathon mode on first.');
    await this.teams.syncCancellations(board.id);
    const title = cleanName(dto.title, 120);
    const body = dto.body.replace(/\r\n/g, '\n').trim().slice(0, 2000);
    if (!title) throw new BadRequestException('Add a title.');
    if (!body) throw new BadRequestException('Write the message.');

    let room: { id: string; name: string } | null = null;
    if (dto.audience === 'ROOM') {
      if (!dto.roomId) throw new BadRequestException('Pick the room.');
      room = await this.prisma.hackathonRoom.findFirst({ where: { id: dto.roomId, leaderboardId: board.id }, select: { id: true, name: true } });
      if (!room) throw new NotFoundException('Room not found');
    }

    const recipients = new Set<string>();
    if (dto.audience !== 'JUDGES') {
      // Teams in the hackathon (not cancelled), or just those in the room.
      const teamRows = await this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, cancelledAt: null, ...(room ? { roomId: room.id } : {}) },
        select: { id: true },
      });
      const members = await this.leaderboard.teamUserIds(teamRows.map((t) => t.id));
      for (const ids of members.values()) for (const id of ids) recipients.add(id);
    }
    if (dto.audience === 'ALL' || dto.audience === 'JUDGES') {
      const judges = await this.prisma.hackathonJudgeProfile.findMany({ where: { leaderboardId: board.id }, select: { userId: true } });
      for (const j of judges) recipients.add(j.userId);
    }
    recipients.delete(userId);
    if (!recipients.size) {
      throw new BadRequestException(
        dto.audience === 'ROOM' ? `No teams are in ${room!.name} yet.` : dto.audience === 'JUDGES' ? 'Add judges or mentors first.' : 'Nobody to send it to yet.',
      );
    }

    await this.prisma.hackathonAnnouncement.create({
      data: {
        leaderboardId: board.id,
        audience: dto.audience,
        roomId: room?.id ?? null,
        roomName: room?.name ?? null,
        title,
        body,
        recipients: recipients.size,
        createdBy: userId,
      },
    });
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
    this.events.emit(NotificationEvents.HackathonAnnouncement, {
      userIds: [...recipients],
      eventId,
      eventTitle: event?.title ?? 'Hackathon',
      title,
      body,
    } satisfies HackathonAnnouncementEvent);
    return this.list(userId, eventId);
  }

  /** Sent announcements, newest first. */
  async list(userId: string, eventId: string) {
    await this.leaderboard.assertCanManage(userId, eventId);
    const board = await this.teams.getBoardOrThrow(eventId);
    const [rows, rooms] = await Promise.all([
      this.prisma.hackathonAnnouncement.findMany({
        where: { leaderboardId: board.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.hackathonRoom.findMany({
        where: { leaderboardId: board.id },
        orderBy: [{ order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, _count: { select: { teams: { where: { cancelledAt: null } } } } },
      }),
    ]);
    const authors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.createdBy))] } },
      select: { id: true, fullName: true, username: true },
    });
    return {
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, teams: r._count.teams })),
      announcements: rows.map((r) => {
        const a = authors.find((u) => u.id === r.createdBy);
        return {
          id: r.id,
          audience: r.audience,
          roomName: r.roomName,
          title: r.title,
          body: r.body,
          recipients: r.recipients,
          sentBy: a?.fullName || a?.username || null,
          createdAt: r.createdAt,
        };
      }),
    };
  }
}
