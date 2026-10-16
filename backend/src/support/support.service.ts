import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { sniffMime, UPLOAD_EXT } from '../registrations/form-uploads.service';
import { Action, AuthorizationService } from '../auth/authorization';
import {
  Prisma,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportCaseKind,
  SupportDesk,
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

/** Categories that are Unifesto's to answer even with event context (decision D2). */
const PLATFORM_CATEGORIES: SupportTicketCategory[] = [
  SupportTicketCategory.ACCOUNT,
  SupportTicketCategory.PAYMENTS,
  SupportTicketCategory.TECHNICAL,
];

/** Attachments (D4): images and PDFs, up to this size, this many per message. */
export const ATTACHMENT_MAX_MB = 10;
const ATTACHMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const ATTACHMENTS_PER_MESSAGE = 5;
/** How long a "view attachment" link works. */
const ATTACHMENT_LINK_SECONDS = 5 * 60;
const attachmentSelect = { id: true, name: true, mime: true, size: true, createdAt: true } satisfies Prisma.SupportAttachmentSelect;

/** The case fields access is decided on. */
type CaseAccess = { requesterId: string; desk: SupportDesk; eventId: string | null };

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly storage: StorageService,
  ) {}

  /* ---------------------------------------------------------------------- */
  /* Access (decision D2)                                                    */
  /* ---------------------------------------------------------------------- */

  private isPlatform(userId: string) {
    return this.authz.can({ id: userId }, Action.PLATFORM_MANAGE);
  }

  /** Space-side support access for the case's event (Space Admin by inheritance). */
  private isSpaceSupport(userId: string, c: CaseAccess) {
    return c.eventId
      ? this.authz.can({ id: userId }, Action.SPACE_MANAGE_SUPPORT, { eventId: c.eventId })
      : Promise.resolve(false);
  }

  /** Requester, Platform, or the event's space support team (which keeps read after escalation). */
  async canSeeCase(userId: string, c: CaseAccess): Promise<boolean> {
    if (c.requesterId === userId) return true;
    return (await this.isPlatform(userId)) || this.isSpaceSupport(userId, c);
  }

  /** Works the desk the case is on now. Platform sees and works everything. */
  private async isDeskMember(userId: string, c: CaseAccess): Promise<boolean> {
    if (await this.isPlatform(userId)) return true;
    return c.desk === SupportDesk.SPACE && this.isSpaceSupport(userId, c);
  }

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
    }
    let eventSpaceId: string | null = null;
    if (eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { spaceId: true },
      });
      if (!event) {
        throw new NotFoundException('Event not found');
      }
      eventSpaceId = event.spaceId;
    }

    // Routing (decision D2): an event question goes to the event's space desk;
    // account, payment and app issues, other kinds, or no event go to Platform.
    const kind = dto.kind ?? SupportCaseKind.HELP;
    const category = dto.category ?? SupportTicketCategory.GENERAL;
    const toSpace =
      !!eventSpaceId &&
      kind === SupportCaseKind.HELP &&
      !PLATFORM_CATEGORIES.includes(category);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: dto.subject,
        category,
        priority: dto.priority ?? SupportTicketPriority.NORMAL,
        requesterId,
        spaceId: toSpace ? eventSpaceId : dto.spaceId ?? null,
        desk: toSpace ? SupportDesk.SPACE : SupportDesk.PLATFORM,
        contactEmail: dto.contactEmail ?? null,
        kind,
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
    // ponytail: space desks don't list their cases yet; the Space inbox is D9.
    const admin = await this.isPlatform(userId);
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
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        requester: { select: userSelect },
        assignedTo: { select: userSelect },
        space: { select: spaceSelect },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: userSelect }, attachments: { select: attachmentSelect } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (!(await this.canSeeCase(userId, ticket))) {
      throw new ForbiddenException('You cannot view this ticket');
    }

    // Internal desk notes never reach the requester.
    if (ticket.requesterId === userId) {
      ticket.messages = ticket.messages.filter((m) => !m.internal);
    }

    return ticket;
  }

  /* ---------------------------------------------------------------------- */
  /* Reply                                                                   */
  /* ---------------------------------------------------------------------- */

  async addMessage(id: string, dto: CreateMessageDto, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        requesterId: true,
        status: true,
        firstResponseAt: true,
        desk: true,
        eventId: true,
      },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    // The requester writes as the requester; otherwise only the current desk
    // replies (a space keeps read, not write, after escalation).
    const admin =
      ticket.requesterId !== userId && (await this.isDeskMember(userId, ticket));
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
  /* Attachments (D4)                                                        */
  /* ---------------------------------------------------------------------- */

  /** The message's author attaches a file to it, while the case is open. */
  async addAttachment(
    ticketId: string,
    messageId: string,
    userId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('Choose a file to upload.');
    const message = await this.prisma.supportMessage.findUnique({
      where: { id: messageId },
      select: {
        ticketId: true,
        authorId: true,
        ticket: { select: { status: true } },
        _count: { select: { attachments: true } },
      },
    });
    if (!message || message.ticketId !== ticketId) throw new NotFoundException('Message not found');
    if (message.authorId !== userId) throw new ForbiddenException('You can only attach files to your own message');
    if (message.ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('This ticket is closed. Open a new ticket to continue.');
    }
    if (message._count.attachments >= ATTACHMENTS_PER_MESSAGE) {
      throw new BadRequestException(`A message can have up to ${ATTACHMENTS_PER_MESSAGE} files.`);
    }
    if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
      throw new BadRequestException(`Files can be up to ${ATTACHMENT_MAX_MB} MB.`);
    }
    const mime = sniffMime(file.buffer);
    if (!mime || !ATTACHMENT_MIMES.includes(mime)) {
      throw new BadRequestException('Attach an image or a PDF.');
    }

    const key = `private/support/${ticketId}/${messageId}/${crypto.randomUUID()}.${UPLOAD_EXT[mime]}`;
    await this.storage.uploadPrivate(file.buffer, key, mime);
    return this.prisma.supportAttachment.create({
      data: {
        messageId,
        key,
        name: (file.originalname || `file.${UPLOAD_EXT[mime]}`).slice(0, 200),
        mime,
        size: file.size,
      },
      select: attachmentSelect,
    });
  }

  /** A 5-minute link to one attachment, for anyone who can see the case (not internal notes for the requester). */
  async attachmentUrl(id: string, userId: string): Promise<{ url: string }> {
    const att = await this.prisma.supportAttachment.findUnique({
      where: { id },
      select: {
        key: true,
        name: true,
        message: {
          select: {
            internal: true,
            ticket: { select: { requesterId: true, desk: true, eventId: true } },
          },
        },
      },
    });
    const ticket = att?.message.ticket;
    if (
      !att ||
      !(await this.canSeeCase(userId, ticket!)) ||
      (att.message.internal && ticket!.requesterId === userId)
    ) {
      throw new NotFoundException('Attachment not found');
    }
    return { url: await this.storage.signedGetUrl(att.key, ATTACHMENT_LINK_SECONDS, att.name) };
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
      const admin = await this.isPlatform(dto.assignedToId);
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

  /**
   * Escalate a space-desk case to Platform (decision D2). Only the requester or
   * the space desk may; there is no auto-escalation. The space keeps read.
   */
  async escalate(id: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, requesterId: true, desk: true, eventId: true, status: true },
    });
    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }
    if (ticket.requesterId !== userId && !(await this.isDeskMember(userId, ticket))) {
      throw new ForbiddenException('You cannot escalate this ticket');
    }
    if (ticket.desk !== SupportDesk.SPACE) {
      throw new BadRequestException('This ticket is already with Unifesto');
    }
    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('This ticket is closed. Open a new ticket to continue.');
    }

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        desk: SupportDesk.PLATFORM,
        escalatedAt: new Date(),
        status: SupportTicketStatus.OPEN,
        resolvedAt: null,
      },
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Stats                                                                    */
  /* ---------------------------------------------------------------------- */

  async getStats(userId: string) {
    const admin = await this.isPlatform(userId);
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
