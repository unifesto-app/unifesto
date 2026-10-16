import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isPlatformAdmin } from '../events/event-access';
import {
  Prisma,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportCaseKind,
  SupportMessageSide,
} from '@prisma/client';
import { CreateTicketDto, CreateMessageDto, UpdateTicketDto } from './dto';

/** Lightweight person shape embedded in ticket payloads. */
const userSelect = {
  id: true,
  fullName: true,
  username: true,
  avatarUrl: true,
  mobileNumber: true,
  identities: { select: { email: true }, take: 1 },
} satisfies Prisma.UserSelect;

const spaceSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
} satisfies Prisma.SpaceSelect;

interface ListParams {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  assignedToId?: string;
  spaceId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Keep only short string/boolean facts about the app build (it's shown to staff as-is). */
const CLIENT_INFO_KEYS = ['platform', 'version', 'build', 'runtimeVersion', 'channel', 'updateId', 'updateCreatedAt', 'emergencyLaunch'];
function cleanClientInfo(info: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, string | boolean> = {};
  for (const key of CLIENT_INFO_KEYS) {
    const v = info[key];
    if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string' && v.length > 0) out[key] = v.slice(0, 100);
  }
  return out;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------------- */
  /* Create                                                                  */
  /* ---------------------------------------------------------------------- */

  async createTicket(dto: CreateTicketDto, requesterId: string) {
    if (dto.spaceId) {
      const space = await this.prisma.space.findUnique({
        where: { id: dto.spaceId },
        select: { id: true },
      });
      if (!space) {
        throw new NotFoundException('Space not found');
      }
    }

    // Event context: a registration must be the requester's own and implies its event.
    let eventId = dto.eventId ?? null;
    if (dto.registrationId) {
      const reg = await this.prisma.eventRegistration.findUnique({
        where: { id: dto.registrationId },
        select: { userId: true, eventId: true },
      });
      if (!reg || reg.userId !== requesterId) {
        throw new NotFoundException('Registration not found');
      }
      eventId = reg.eventId;
    } else if (eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }
    }

    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: dto.subject,
        category: dto.category ?? SupportTicketCategory.GENERAL,
        priority: dto.priority ?? SupportTicketPriority.NORMAL,
        requesterId,
        spaceId: dto.spaceId ?? null,
        contactEmail: dto.contactEmail ?? null,
        kind: dto.kind ?? SupportCaseKind.HELP,
        eventId,
        registrationId: dto.registrationId ?? null,
        requesterLastReadAt: new Date(),
        ...(dto.clientInfo ? { clientInfo: cleanClientInfo(dto.clientInfo) } : {}),
        messages: {
          create: {
            authorId: requesterId,
            isStaffReply: false,
            side: SupportMessageSide.REQUESTER,
            body: dto.message,
          },
        },
      },
      include: {
        requester: { select: userSelect },
        space: { select: spaceSelect },
        _count: { select: { messages: true } },
      },
    });

    return ticket;
  }

  /* ---------------------------------------------------------------------- */
  /* List (role-scoped)                                                      */
  /* ---------------------------------------------------------------------- */

  async listTickets(userId: string, params: ListParams) {
    const admin = await isPlatformAdmin(this.prisma, userId);
    const { page = 1, limit = 20 } = params;
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const where: Prisma.SupportTicketWhereInput = {};

    // Non-admins only ever see their own tickets.
    if (!admin) {
      where.requesterId = userId;
    } else if (params.assignedToId) {
      where.assignedToId = params.assignedToId;
    }

    if (params.status) where.status = params.status;
    if (params.category) where.category = params.category;
    if (params.priority) where.priority = params.priority;
    if (params.spaceId) where.spaceId = params.spaceId;
    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        ...(/^\d+$/.test(search)
          ? [{ ticketNumber: Number(search) }]
          : []),
      ];
    }

    const [tickets, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take,
        include: {
          requester: { select: userSelect },
          assignedTo: { select: userSelect },
          space: { select: spaceSelect },
          _count: { select: { messages: true } },
        },
        orderBy: [{ lastMessageAt: 'desc' }],
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets,
      pagination: {
        page,
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Read one                                                                */
  /* ---------------------------------------------------------------------- */

  async getTicket(id: string, userId: string) {
    const admin = await isPlatformAdmin(this.prisma, userId);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        requester: { select: userSelect },
        assignedTo: { select: userSelect },
        space: { select: spaceSelect },
        messages: {
          // Internal desk notes never reach the requester.
          ...(admin ? {} : { where: { internal: false } }),
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSelect } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (!admin && ticket.requesterId !== userId) {
      throw new ForbiddenException('You cannot view this ticket');
    }

    return ticket;
  }

  /* ---------------------------------------------------------------------- */
  /* Reply                                                                   */
  /* ---------------------------------------------------------------------- */

  async addMessage(id: string, dto: CreateMessageDto, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, requesterId: true, status: true, firstResponseAt: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    const admin = await isPlatformAdmin(this.prisma, userId);
    if (!admin && ticket.requesterId !== userId) {
      throw new ForbiddenException('You cannot reply to this ticket');
    }

    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException(
        'This ticket is closed. Open a new ticket to continue.',
      );
    }

    // A staff reply moves the ball to the requester; a requester reply
    // (re)opens the ticket for staff attention. A bot chat stays with the bot
    // until it hands off.
    const nextStatus = admin
      ? SupportTicketStatus.PENDING
      : ticket.status === SupportTicketStatus.BOT
        ? SupportTicketStatus.BOT
        : SupportTicketStatus.OPEN;
    const now = new Date();

    const [message] = await this.prisma.$transaction([
      this.prisma.supportMessage.create({
        data: {
          ticketId: id,
          authorId: userId,
          isStaffReply: admin,
          side: admin ? SupportMessageSide.DESK : SupportMessageSide.REQUESTER,
          body: dto.body,
        },
        include: { author: { select: userSelect } },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          status: nextStatus,
          lastMessageAt: now,
          // Writing a reply means the writer's side has read the thread.
          ...(admin
            ? { deskLastReadAt: now, ...(ticket.firstResponseAt ? {} : { firstResponseAt: now }) }
            : { requesterLastReadAt: now }),
          ...(nextStatus === SupportTicketStatus.OPEN
            ? { resolvedAt: null }
            : {}),
        },
      }),
    ]);

    return message;
  }

  /* ---------------------------------------------------------------------- */
  /* Admin mutations                                                         */
  /* ---------------------------------------------------------------------- */

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (dto.assignedToId) {
      const admin = await isPlatformAdmin(this.prisma, dto.assignedToId);
      if (!admin) {
        throw new BadRequestException('Tickets can only be assigned to admins');
      }
    }

    const data: Prisma.SupportTicketUpdateInput = {};
    if (dto.priority) data.priority = dto.priority;
    if (dto.category) data.category = dto.category;
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.status) {
      data.status = dto.status;
      data.resolvedAt =
        dto.status === SupportTicketStatus.RESOLVED ? new Date() : null;
      data.closedAt =
        dto.status === SupportTicketStatus.CLOSED ? new Date() : null;
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data,
      include: {
        requester: { select: userSelect },
        assignedTo: { select: userSelect },
        space: { select: spaceSelect },
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * The requester can close or reopen their own ticket. Reopening from a
   * resolved/closed state sets it back to OPEN so staff pick it up again.
   */
  async setStatusAsOwner(
    id: string,
    userId: string,
    status: SupportTicketStatus,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, requesterId: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.requesterId !== userId) {
      throw new ForbiddenException('You cannot change this ticket');
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        closedAt: status === SupportTicketStatus.CLOSED ? new Date() : null,
        ...(status === SupportTicketStatus.OPEN
          ? { resolvedAt: null, lastMessageAt: new Date() }
          : {}),
      },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Stats                                                                    */
  /* ---------------------------------------------------------------------- */

  async getStats(userId: string) {
    const admin = await isPlatformAdmin(this.prisma, userId);
    const scope: Prisma.SupportTicketWhereInput = admin
      ? {}
      : { requesterId: userId };

    const [open, pending, resolved, closed] = await Promise.all([
      this.prisma.supportTicket.count({
        where: { ...scope, status: SupportTicketStatus.OPEN },
      }),
      this.prisma.supportTicket.count({
        where: { ...scope, status: SupportTicketStatus.PENDING },
      }),
      this.prisma.supportTicket.count({
        where: { ...scope, status: SupportTicketStatus.RESOLVED },
      }),
      this.prisma.supportTicket.count({
        where: { ...scope, status: SupportTicketStatus.CLOSED },
      }),
    ]);

    return { open, pending, resolved, closed, total: open + pending + resolved + closed };
  }
}
