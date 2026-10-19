import type { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RefundStatus,
  SupportCaseKind,
  SupportDesk,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { openSubjectCase, updateSubjectCase } from '../support/subject-cases';

/**
 * D6: every refund request is an Assist case. The event's space reviews it
 * first (PENDING_CURATOR = Space desk), Unifesto decides (Platform desk). A
 * refund raised from an existing case (`supportTicketId`) lives in that case.
 * Money stays in RefundsService; this only keeps the case's desk and timeline.
 */
export const refundDesk = (status: RefundStatus) =>
  status === RefundStatus.PENDING_CURATOR ? SupportDesk.SPACE : SupportDesk.PLATFORM;

type RefundRef = { id: string; supportTicketId: string | null };

export function openRefundCase(
  events: EventEmitter2 | undefined,
  r: RefundRef & {
    status: RefundStatus;
    reason: string;
    registrationId: string;
    eventId: string;
    /** The ticket holder: the case is theirs to follow, whoever raised it. */
    holderId: string;
    raisedByHolder: boolean;
    /** A paid cancellation (or a cancelled event): the refund cancels the booking. */
    cancellation?: boolean;
    event: { spaceId: string; title: string };
  },
) {
  if (r.supportTicketId) return;
  openSubjectCase(events, {
    subjectType: 'RefundRequest',
    subjectId: r.id,
    requesterId: r.holderId,
    kind: r.cancellation ? SupportCaseKind.CANCELLATION : SupportCaseKind.REFUND,
    desk: refundDesk(r.status),
    spaceId: r.event.spaceId,
    eventId: r.eventId,
    registrationId: r.registrationId,
    subject: `${r.cancellation ? 'Cancellation' : 'Refund'}: ${r.event.title}`,
    message: r.raisedByHolder ? r.reason : `Refund raised for the ticket holder. Reason: ${r.reason}`,
    raisedForRequester: !r.raisedByHolder,
    category: SupportTicketCategory.PAYMENTS,
  });
}

export function updateRefundCase(
  events: EventEmitter2 | undefined,
  r: RefundRef,
  actorId: string | null,
  text: string,
  move: { status?: SupportTicketStatus; desk?: SupportDesk } = {},
) {
  updateSubjectCase(events, {
    subjectType: 'RefundRequest',
    subjectId: r.id,
    caseId: r.supportTicketId,
    actorId,
    text,
    ...move,
  });
}

/** " Note: …" when a reviewer left one. */
export const withNote = (note?: string | null) => (note?.trim() ? ` Note: ${note.trim()}` : '');
