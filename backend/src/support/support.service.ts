import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
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

/** D3: something happened on a case that the other side should hear about. */
export const SUPPORT_CASE_EVENT = 'support.case';
export interface SupportCaseEvent {
  ticketId: string;
  kind: 'CREATED' | 'REPLIED' | 'STATUS' | 'ESCALATED';
  /** The side to tell. */
  to: 'REQUESTER' | 'DESK';
  /** Who did it; never told about their own action. */
  actorId: string;
  /** A reply's text, for the push and email body. */
  message?: string;
}

/** Unread for one side: nothing read yet, or a message since it last read. */
export function isUnread(lastReadAt: Date | null, lastMessageAt: Date): boolean {
  return !lastReadAt || lastMessageAt > lastReadAt;
}

/** Lightweight person shape embedded in ticket payloads. */
const userSelect = {
  id: true,
  fullName: true,
  username: true,
  avatarUrl: true,
  mobileNumber: true,
  identities: { select: { email: true }, take: 1 },
} satisfies Prisma.UserSelect;

/** Message authors and assignees: no contact details (desk crew reply too). */
const publicUserSelect = {
  id: true,
  fullName: true,
  username: true,
  avatarUrl: true,
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
type CaseAccess = {
  requesterId: string;
  desk: SupportDesk;
  eventId: string | null;
  spaceId: string | null;
  escalatedAt: Date | null;
};

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  private notify(e: SupportCaseEvent) {
    this.events.emit(SUPPORT_CASE_EVENT, e);
  }

  /* ---------------------------------------------------------------------- */
  /* Access (decision D2)                                                    */
  /* ---------------------------------------------------------------------- */

  private isPlatform(userId: string) {
    return this.authz.can({ id: userId }, Action.PLATFORM_MANAGE);
  }

  /**
   * Space-side support access: the event's support team (Space Admin by
   * inheritance), or for a space-level case with no event, the Space Admins.
   */
  private isSpaceSupport(userId: string, c: Omit<CaseAccess, 'requesterId'>) {
    if (c.eventId) {
      return this.authz.can({ id: userId }, Action.EVENT_MANAGE_SUPPORT, { eventId: c.eventId });
    }
    if (c.spaceId) {
      return this.authz.can({ id: userId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: c.spaceId });
    }
    return Promise.resolve(false);
  }

  /**
   * Requester, Platform, or the event's space support team, but only on a case
   * that is or was on the space desk (it keeps read after escalation). A case
   * routed straight to Platform stays Platform-only even with an eventId.
   */
  async canSeeCase(userId: string, c: CaseAccess): Promise<boolean> {
    if (c.requesterId === userId) return true;
    if (await this.isPlatform(userId)) return true;
    return (c.desk === SupportDesk.SPACE || c.escalatedAt !== null) && this.isSpaceSupport(userId, c);
  }

  /** Works the desk the case is on now. Platform sees and works everything. */
  private async isDeskMember(userId: string, c: CaseAccess): Promise<boolean> {
    if (await this.isPlatform(userId)) return true;
    return c.desk === SupportDesk.SPACE && this.isSpaceSupport(userId, c);
  }

  /**
   * Everyone who works the case's space desk now (D3 notifications): role
   * holders on the event or space, kept when they pass the same check as access.
   */
  async spaceDeskMemberIds(c: Omit<CaseAccess, 'requesterId'>): Promise<string[]> {
    if (c.desk !== SupportDesk.SPACE) return [];
    const scopes: Prisma.UserRoleWhereInput[] = [];
    if (c.eventId) scopes.push({ eventId: c.eventId });
    if (c.spaceId) scopes.push({ spaceId: c.spaceId, eventId: null });
    if (!scopes.length) return [];
    const roles = await this.prisma.userRole.findMany({
      where: { OR: scopes },
      select: { userId: true },
      distinct: ['userId'],
    });
    // ponytail: one access check per role holder; fine for a space's team size.
    const ids: string[] = [];
    for (const { userId } of roles) {
      if (await this.isSpaceSupport(userId, c)) ids.push(userId);
    }
    return ids;
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

    // Routing (decision D2): an event or space question goes to that space's
    // desk; account, payment and app issues, other kinds, or no context go to
    // Platform. A space-only case from someone who runs that space is the space
    // app / operator "contact Unifesto" flow, so it stays with Platform.
    const kind = dto.kind ?? SupportCaseKind.HELP;
    const category = dto.category ?? SupportTicketCategory.GENERAL;
    const targetSpaceId = eventSpaceId ?? dto.spaceId ?? null;
    const toSpace =
      !!targetSpaceId &&
      kind === SupportCaseKind.HELP &&
      !PLATFORM_CATEGORIES.includes(category) &&
      (!!eventSpaceId ||
        !(await this.authz.can({ id: requesterId }, Action.SPACE_MANAGE_SETTINGS, { spaceId: targetSpaceId })));

    const now = new Date();
    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: dto.subject,
        category,
        priority: dto.priority ?? SupportTicketPriority.NORMAL,
        requesterId,
        spaceId: toSpace ? targetSpaceId : dto.spaceId ?? null,
        desk: toSpace ? SupportDesk.SPACE : SupportDesk.PLATFORM,
        contactEmail: dto.contactEmail ?? null,
        kind,
        eventId,
        registrationId: dto.registrationId ?? null,
        // Same instant for both, so the requester's own first message isn't unread.
        lastMessageAt: now,
        requesterLastReadAt: now,
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

    this.notify({ ticketId: ticket.id, kind: 'CREATED', to: 'DESK', actorId: requesterId });
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
      // Platform reads as the desk on its own cases; everyone else as the requester.
      tickets: tickets.map((t) => ({
        ...t,
        unread: admin
          ? t.desk === SupportDesk.PLATFORM && isUnread(t.deskLastReadAt, t.lastMessageAt)
          : isUnread(t.requesterLastReadAt, t.lastMessageAt),
      })),
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
        assignedTo: { select: publicUserSelect },
        space: { select: spaceSelect },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: publicUserSelect }, attachments: { select: attachmentSelect } },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found');
    }

    if (!(await this.canSeeCase(userId, ticket))) {
      throw new ForbiddenException('You cannot view this ticket');
    }

    // Opening the thread reads it for the viewer's side (D3). Past the access
    // check, a viewer who is neither requester nor Platform is space support;
    // a space that only keeps read after escalation doesn't mark the desk read.
    const isRequester = ticket.requesterId === userId;
    const platform = !isRequester && (await this.isPlatform(userId));
    const readField = isRequester
      ? 'requesterLastReadAt'
      : platform || ticket.desk === SupportDesk.SPACE
        ? 'deskLastReadAt'
        : null;
    if (readField) {
      await this.prisma.supportTicket.update({ where: { id }, data: { [readField]: new Date() } });
    }

    // Internal desk notes never reach the requester.
    if (isRequester) {
      ticket.messages = ticket.messages.filter((m) => !m.internal);
    }
    // The space desk gets the requester's email, not their phone number.
    else if (!platform) {
      const { mobileNumber: _phone, ...requester } = ticket.requester;
      return { ...ticket, requester };
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
        spaceId: true,
        escalatedAt: true,
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
        include: { author: { select: publicUserSelect } },
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

    // A bot chat is the requester talking to the bot; the desk hears on handoff.
    if (nextStatus !== SupportTicketStatus.BOT) {
      this.notify({ ticketId: id, kind: 'REPLIED', to: admin ? 'REQUESTER' : 'DESK', actorId: userId, message: dto.body });
    }
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
        ticket: { select: { status: true, requesterId: true, desk: true, eventId: true, spaceId: true, escalatedAt: true } },
        _count: { select: { attachments: true } },
      },
    });
    if (!message || message.ticketId !== ticketId) throw new NotFoundException('Message not found');
    if (message.authorId !== userId) throw new ForbiddenException('You can only attach files to your own message');
    // Same write rule as addMessage: the requester, or whoever works the desk now.
    if (message.ticket.requesterId !== userId && !(await this.isDeskMember(userId, message.ticket))) {
      throw new ForbiddenException('You cannot add files to this ticket');
    }
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
            ticket: { select: { requesterId: true, desk: true, eventId: true, spaceId: true, escalatedAt: true } },
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

  async updateTicket(id: string, dto: UpdateTicketDto, actorId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, status: true },
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

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data,
      include: {
        requester: { select: userSelect },
        assignedTo: { select: userSelect },
        space: { select: spaceSelect },
        _count: { select: { messages: true } },
      },
    });
    if (
      dto.status &&
      dto.status !== ticket.status &&
      (dto.status === SupportTicketStatus.RESOLVED || dto.status === SupportTicketStatus.CLOSED)
    ) {
      this.notify({ ticketId: id, kind: 'STATUS', to: 'REQUESTER', actorId });
    }
    return updated;
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

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        closedAt: status === SupportTicketStatus.CLOSED ? new Date() : null,
        ...(status === SupportTicketStatus.OPEN
          ? { resolvedAt: null, lastMessageAt: new Date() }
          : {}),
      },
    });
    if (status === SupportTicketStatus.OPEN) {
      this.notify({ ticketId: id, kind: 'STATUS', to: 'DESK', actorId: userId });
    }
    return updated;
  }

  /**
   * Escalate a space-desk case to Platform (decision D2). Only the requester or
   * the space desk may; there is no auto-escalation. The space keeps read.
   */
  async escalate(id: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true, requesterId: true, desk: true, eventId: true, spaceId: true, escalatedAt: true, status: true },
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

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        desk: SupportDesk.PLATFORM,
        escalatedAt: new Date(),
        status: SupportTicketStatus.OPEN,
        resolvedAt: null,
      },
    });
    // Platform hears about it; so does the requester when the space escalated.
    this.notify({ ticketId: id, kind: 'ESCALATED', to: 'DESK', actorId: userId });
    this.notify({ ticketId: id, kind: 'ESCALATED', to: 'REQUESTER', actorId: userId });
    return updated;
  }

  /* ---------------------------------------------------------------------- */
  /* Stats                                                                    */
  /* ---------------------------------------------------------------------- */

  async getStats(userId: string) {
    const admin = await this.isPlatform(userId);
    const scope: Prisma.SupportTicketWhereInput = admin
      ? {}
      : { requesterId: userId };

    // Unread for the viewer's side (D3 badges): Platform's own desk, else your cases.
    const fields = this.prisma.supportTicket.fields;
    const unreadWhere: Prisma.SupportTicketWhereInput = admin
      ? {
          desk: SupportDesk.PLATFORM,
          status: { not: SupportTicketStatus.CLOSED },
          OR: [{ deskLastReadAt: null }, { lastMessageAt: { gt: fields.deskLastReadAt } }],
        }
      : {
          requesterId: userId,
          OR: [{ requesterLastReadAt: null }, { lastMessageAt: { gt: fields.requesterLastReadAt } }],
        };

    const [open, pending, resolved, closed, unread] = await Promise.all([
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
      this.prisma.supportTicket.count({ where: unreadWhere }),
    ]);

    return { open, pending, resolved, closed, unread, total: open + pending + resolved + closed };
  }
}
