import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  SupportCaseKind,
  SupportDesk,
  SupportMessageSide,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Typed records that live in their own tables (requests, payouts, privacy…)
 * get an Assist case through these events, so their services never import
 * SupportModule (it sits above EventsModule, so that would be a cycle). The
 * record's own flow keeps sending its own notifications; the case only holds
 * the thread, so nothing here notifies anyone.
 */
export const SUBJECT_CASE_OPEN = 'assist.subject.open';
export const SUBJECT_CASE_UPDATE = 'assist.subject.update';

export interface SubjectCaseOpen {
  /** Prisma model name, also a key of SUBJECT_MODELS in support.service. */
  subjectType: string;
  subjectId: string;
  requesterId: string;
  kind: SupportCaseKind;
  /** REQUEST kind: what is being asked for, e.g. SPACE, SUB_SPACE. */
  requestType?: string;
  desk: SupportDesk;
  /** For a SPACE desk, the space that works it. */
  spaceId?: string | null;
  eventId?: string | null;
  subject: string;
  /** The requester's first message: what they asked for, in words. */
  message: string;
  category?: SupportTicketCategory;
}

export interface SubjectCaseUpdate {
  subjectType: string;
  subjectId: string;
  /** Who acted; falls back to the requester when the system did it. */
  actorId?: string | null;
  /** The SYSTEM line, e.g. "Unifesto approved the space request". */
  text: string;
  /** Move the case too: RESOLVED or CLOSED once decided. */
  status?: SupportTicketStatus;
}

/** Publish helpers. `events` is optional so unit specs can build services without one. */
export const openSubjectCase = (events: EventEmitter2 | undefined, e: SubjectCaseOpen) =>
  events?.emit(SUBJECT_CASE_OPEN, e);
export const updateSubjectCase = (events: EventEmitter2 | undefined, e: SubjectCaseUpdate) =>
  events?.emit(SUBJECT_CASE_UPDATE, e);

/** Opens and updates the case that wraps a typed record. Failures are logged, never thrown back. */
@Injectable()
export class SubjectCases {
  private readonly logger = new Logger(SubjectCases.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(SUBJECT_CASE_OPEN, { async: true })
  async onOpen(e: SubjectCaseOpen): Promise<string | null> {
    try {
      const existing = await this.prisma.supportTicket.findFirst({
        where: { subjectType: e.subjectType, subjectId: e.subjectId },
        select: { id: true },
      });
      if (existing) return existing.id;
      const now = new Date();
      const t = await this.prisma.supportTicket.create({
        data: {
          subject: e.subject.slice(0, 300),
          category: e.category ?? SupportTicketCategory.GENERAL,
          requesterId: e.requesterId,
          kind: e.kind,
          requestType: e.requestType ?? null,
          desk: e.desk,
          spaceId: e.spaceId ?? null,
          eventId: e.eventId ?? null,
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          lastMessageAt: now,
          requesterLastReadAt: now,
          messages: {
            create: { authorId: e.requesterId, side: SupportMessageSide.REQUESTER, body: e.message },
          },
        },
        select: { id: true },
      });
      return t.id;
    } catch (err) {
      this.logger.error(`open ${e.subjectType} ${e.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  @OnEvent(SUBJECT_CASE_UPDATE, { async: true })
  async onUpdate(e: SubjectCaseUpdate): Promise<void> {
    try {
      const c = await this.prisma.supportTicket.findFirst({
        where: { subjectType: e.subjectType, subjectId: e.subjectId },
        select: { id: true, requesterId: true },
      });
      if (!c) return; // raised before its kind opened cases
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.supportMessage.create({
          data: {
            ticketId: c.id,
            authorId: e.actorId ?? c.requesterId,
            isStaffReply: true,
            side: SupportMessageSide.SYSTEM,
            body: e.text,
            createdAt: now,
          },
        }),
        this.prisma.supportTicket.update({
          where: { id: c.id },
          data: {
            lastMessageAt: now,
            ...(e.status
              ? {
                  status: e.status,
                  resolvedAt: e.status === SupportTicketStatus.RESOLVED ? now : null,
                  closedAt: e.status === SupportTicketStatus.CLOSED ? now : null,
                }
              : {}),
          },
        }),
      ]);
    } catch (err) {
      this.logger.error(`update ${e.subjectType} ${e.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
