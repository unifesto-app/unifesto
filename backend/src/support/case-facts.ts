import { EventStatus, PaymentStatus, RegistrationStatus, RefundStatus } from '@prisma/client';
import { OPEN_REFUND_STATUSES } from '../refunds/open-statuses';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Policy facts about one booking, computed by code so AI never does the maths
 * (D15 desk copilot, D14 bot tools). The rules mirror the gates that enforce
 * them: RefundsService.createRequest (attendee path) and
 * RegistrationCancellationService.performSelfCancellation. Change them together.
 */
export interface BookingFacts {
  registrationId: string;
  event: { title: string; status: EventStatus; startsAt: string; endsAt: string };
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  /** Rupees. */
  paid: number;
  processingFee: number;
  refunded: number;
  /** Base (ticket price) still refundable; the processing fee never is. */
  refundable: number;
  refund: { canRequest: boolean; why?: string; open?: { status: RefundStatus; requestedAmount: number | null } };
  cancel: { canCancel: boolean; why?: string };
}

export interface BookingInput {
  id: string;
  status: RegistrationStatus;
  paymentStatus: PaymentStatus;
  totalAmount: unknown;
  processingFee: unknown;
  refundedAmount: unknown;
  event: { title: string; status: EventStatus; startDateTime: Date; endDateTime: Date };
  /** Extra seats bought later that still hold money. */
  addons: { totalAmount: unknown; processingFee: unknown; refundedAmount: unknown }[];
  openRefund: { status: RefundStatus; requestedAmount: unknown } | null;
}

const money = (n: number) => Math.round(n * 100) / 100;
const PAID: PaymentStatus[] = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED];

export function bookingFacts(b: BookingInput, now = new Date()): BookingFacts {
  const all = [b, ...b.addons];
  const paid = money(all.reduce((s, x) => s + Number(x.totalAmount), 0));
  const processingFee = money(all.reduce((s, x) => s + Number(x.processingFee), 0));
  const refunded = money(all.reduce((s, x) => s + Number(x.refundedAmount), 0));
  const base = money(paid - processingFee);
  const refundable = PAID.includes(b.paymentStatus) ? Math.max(0, money(base - refunded)) : 0;

  // Same order as RefundsService.createRequest, so the first reason matches its error.
  let refundWhy: string | undefined;
  if (b.event.status === EventStatus.COMPLETED) refundWhy = 'the event has ended, so refund requests are closed';
  else if (!PAID.includes(b.paymentStatus)) refundWhy = 'only paid bookings can be refunded';
  else if (base <= 0) refundWhy = 'it is a free booking, so there is nothing to refund';
  else if (refundable <= 0) refundWhy = 'it is already fully refunded';
  else if (b.openRefund) refundWhy = 'a refund request is already open';

  // Same order as performSelfCancellation.
  let cancelWhy: string | undefined;
  if (b.status === RegistrationStatus.CANCELLED) cancelWhy = 'it is already cancelled';
  else if (b.event.startDateTime < now) cancelWhy = 'the event has started';
  else if (Number(b.totalAmount) > 0 && PAID.includes(b.paymentStatus))
    cancelWhy = 'paid tickets are cancelled through a refund request';

  return {
    registrationId: b.id,
    event: {
      title: b.event.title,
      status: b.event.status,
      startsAt: b.event.startDateTime.toISOString(),
      endsAt: b.event.endDateTime.toISOString(),
    },
    status: b.status,
    paymentStatus: b.paymentStatus,
    paid,
    processingFee,
    refunded,
    refundable,
    refund: {
      canRequest: !refundWhy,
      ...(refundWhy ? { why: refundWhy } : {}),
      ...(b.openRefund
        ? {
            open: {
              status: b.openRefund.status,
              requestedAmount: b.openRefund.requestedAmount == null ? null : Number(b.openRefund.requestedAmount),
            },
          }
        : {}),
    },
    cancel: { canCancel: !cancelWhy, ...(cancelWhy ? { why: cancelWhy } : {}) },
  };
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const REFUND_STAGE: Record<RefundStatus, string> = {
  PENDING_CURATOR: 'with the organiser',
  PENDING_ADMIN: 'with Unifesto',
  PROCESSING: 'being paid out',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REFUND_FAILED: 'failed at the bank and waiting to be sent again',
};

/** Short plain lines for staff and for a prompt. Sentence case, no em dashes. */
export function describeBooking(f: BookingFacts): string[] {
  const lines = [
    `Event: ${f.event.title} (${f.event.status.toLowerCase()}), ${day(f.event.startsAt)} to ${day(f.event.endsAt)}`,
    `Booking: ${f.status.toLowerCase()}, payment ${f.paymentStatus.toLowerCase().replace('_', ' ')}`,
  ];
  if (f.paid > 0) {
    lines.push(
      `Paid ${rupees(f.paid)} incl. ${rupees(f.processingFee)} processing fee (never refundable); refunded so far ${rupees(f.refunded)}; refundable now ${rupees(f.refundable)}`,
    );
  }
  lines.push(
    f.refund.canRequest
      ? `Refund request: allowed, up to ${rupees(f.refundable)}, until the event ends (${day(f.event.endsAt)})`
      : `Refund request: not allowed, ${f.refund.why}`,
  );
  if (f.refund.open) {
    const amt = f.refund.open.requestedAmount;
    lines.push(`Open refund request: ${REFUND_STAGE[f.refund.open.status]}${amt != null ? `, for ${rupees(amt)}` : ''}`);
  }
  lines.push(f.cancel.canCancel ? 'Cancel directly: allowed' : `Cancel directly: not allowed, ${f.cancel.why}`);
  return lines;
}

/** Loads one registration's facts, or null when it is gone. */
export async function loadBookingFacts(prisma: PrismaService, registrationId: string): Promise<BookingFacts | null> {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      totalAmount: true,
      processingFee: true,
      refundedAmount: true,
      event: { select: { title: true, status: true, startDateTime: true, endDateTime: true } },
      refundRequests: {
        where: { status: { in: OPEN_REFUND_STATUSES } },
        select: { status: true, requestedAmount: true },
        take: 1,
      },
    },
  });
  if (!reg) return null;
  // Same set as RefundsService.paidSeatAddons.
  const addons = await prisma.groupSeatPurchase.findMany({
    where: {
      registrationId,
      seatsAddedAt: { not: null },
      paymentStatus: { in: PAID },
    },
    select: { totalAmount: true, processingFee: true, refundedAmount: true },
  });
  return bookingFacts({ ...reg, addons, openRefund: reg.refundRequests[0] ?? null });
}
