import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '../common/on-event';
import {
  SupportCaseKind,
  SupportDesk,
  SupportMessageSide,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORT_CASE_EVENT, type SupportCaseEvent } from './support.service';

/**
 * Typed records that live in their own tables (requests, payouts, privacy…)
 * get an Assist case through these events, so their services never import
 * SupportModule (it sits above EventsModule, so that would be a cycle). The
 * record's own flow keeps sending its own notifications; the case only holds
 * the thread, so nothing here notifies anyone unless `notify` is set (a record
 * with no notifications of its own, like an event request).
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
  registrationId?: string | null;
  subject: string;
  /** The requester's first message: what they asked for, in words. */
  message: string;
  /** Someone else raised it for the requester (an organiser, Unifesto): the first line is SYSTEM. */
  raisedForRequester?: boolean;
  category?: SupportTicketCategory;
  /** Tell the desk through D3 (staff push on Platform). */
  notify?: boolean;
}

export interface SubjectCaseUpdate {
  subjectType: string;
  subjectId: string;
  /** The case to update when the record was raised from an existing one (RefundRequest.supportTicketId). */
  caseId?: string | null;
  /** Who acted; falls back to the requester when the system did it. */
  actorId?: string | null;
  /** The SYSTEM line, e.g. "Unifesto approved the space request". */
  text: string;
  /** Move the case too: RESOLVED or CLOSED once decided. */
  status?: SupportTicketStatus;
  /** Hand the case to this desk. Moving to Platform keeps the space's read access, like an escalation. */
  desk?: SupportDesk;
  /** Tell the requester through D3 when this resolves or closes the case. */
  notify?: boolean;
}

/** Publish helpers. `events` is optional so unit specs can build services without one. */
export const openSubjectCase = (events: EventEmitter2 | undefined, e: SubjectCaseOpen) =>
  events?.emit(SUBJECT_CASE_OPEN, e);
export const updateSubjectCase = (events: EventEmitter2 | undefined, e: SubjectCaseUpdate) =>
  events?.emit(SUBJECT_CASE_UPDATE, e);

/** A reviewed request: "Unifesto approved the space request." plus the reviewer's note; resolves the case. */
export const decideSubjectCase = (
  events: EventEmitter2 | undefined,
  e: Omit<SubjectCaseUpdate, 'text' | 'status'> & { approved: boolean; what: string; note?: string | null; by?: string },
) =>
  updateSubjectCase(events, {
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    actorId: e.actorId,
    text: `${e.by ?? 'Unifesto'} ${e.approved ? 'approved' : 'declined'} ${e.what}.${e.note ? ` Note: ${e.note}` : ''}`,
    status: SupportTicketStatus.RESOLVED,
    notify: e.notify,
  });

/** Opens and updates the case that wraps a typed record. Failures are logged, never thrown back. */
@Injectable()
export class SubjectCases {
  private readonly logger = new Logger(SubjectCases.name);

  /** Listeners run on setImmediate, so an update emitted right after its open could pass it. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  private tell(e: SupportCaseEvent) {
    this.events?.emit(SUPPORT_CASE_EVENT, e);
  }

  // ponytail: per-process ordering; fine while one backend instance handles events.
  private inOrder<T>(e: { subjectType: string; subjectId: string }, fn: () => Promise<T>): Promise<T> {
    const key = `${e.subjectType}:${e.subjectId}`;
    const run = (this.queues.get(key) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => this.queues.get(key) === tail && this.queues.delete(key));
    return run;
  }

  @OnEvent(SUBJECT_CASE_OPEN, { async: true })
  onOpen(e: SubjectCaseOpen): Promise<string | null> {
    return this.inOrder(e, () => this.open(e));
  }

  @OnEvent(SUBJECT_CASE_UPDATE, { async: true })
  onUpdate(e: SubjectCaseUpdate): Promise<void> {
    return this.inOrder(e, () => this.update(e));
  }

  private async open(e: SubjectCaseOpen): Promise<string | null> {
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
          registrationId: e.registrationId ?? null,
          subjectType: e.subjectType,
          subjectId: e.subjectId,
          lastMessageAt: now,
          requesterLastReadAt: now,
          messages: {
            create: e.raisedForRequester
              ? { authorId: e.requesterId, isStaffReply: true, side: SupportMessageSide.SYSTEM, body: e.message }
              : { authorId: e.requesterId, side: SupportMessageSide.REQUESTER, body: e.message },
          },
        },
        select: { id: true },
      });
      if (e.notify) this.tell({ ticketId: t.id, kind: 'CREATED', to: 'DESK', actorId: e.requesterId });
      return t.id;
    } catch (err) {
      this.logger.error(`open ${e.subjectType} ${e.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async update(e: SubjectCaseUpdate): Promise<void> {
    try {
      const c = await this.prisma.supportTicket.findFirst({
        where: e.caseId ? { id: e.caseId } : { subjectType: e.subjectType, subjectId: e.subjectId },
        select: { id: true, requesterId: true, desk: true },
      });
      const move = e.desk && e.desk !== c?.desk ? e.desk : null;
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
            ...(move ? { desk: move, ...(move === SupportDesk.PLATFORM ? { escalatedAt: now } : {}) } : {}),
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
      if (e.notify && e.status) {
        this.tell({ ticketId: c.id, kind: 'STATUS', to: 'REQUESTER', actorId: e.actorId ?? c.requesterId, message: e.text });
      }
    } catch (err) {
      this.logger.error(`update ${e.subjectType} ${e.subjectId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
