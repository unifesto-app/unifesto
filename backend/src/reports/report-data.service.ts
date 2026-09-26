import { Injectable } from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  RegistrationStatus,
  ReportSection,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';

/** Payment states where money was actually captured (mirrors the txn export). */
const CAPTURED_STATUSES: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

/** Optional reporting window applied to the registration set (by registeredAt). */
export interface ReportWindow {
  from: Date | null;
  to: Date | null;
}

/** Headline KPIs for the OVERVIEW section (also snapshotted onto the report). */
export interface ReportOverview {
  totalRegistrations: number;
  /** People attending, group bookings expanded to headcount. */
  attending: number;
  checkedIn: number;
  waitlisted: number;
  /** checkedIn / attending, as a 0–100 percentage; null when nobody attends. */
  attendanceRate: number | null;
  /** attending / capacity, as a 0–100 percentage; null when uncapped. */
  capacityFill: number | null;
  // Money, INR. net = collected − fees − refunded (cash-accurate).
  collected: number;
  fees: number;
  refunded: number;
  net: number;
}

export interface TicketRow {
  name: string;
  price: number;
  sold: number;
  revenue: number;
  remaining: number | null;
}

export interface AttendeeRow {
  name: string;
  email: string;
  ticket: string;
  status: string;
  paymentStatus: string;
  checkedIn: boolean;
}

export interface CheckinSummary {
  attending: number;
  checkedIn: number;
  notCheckedIn: number;
  rate: number | null;
}

/** Everything a report might render; each key is populated only if requested. */
export interface ReportData {
  overview?: ReportOverview;
  tickets?: TicketRow[];
  attendees?: AttendeeRow[];
  revenue?: ReportOverview; // revenue reuses the money fields of the overview
  checkins?: CheckinSummary;
}

/**
 * Reads an event's registrations once and derives whichever section figures a
 * report asked for. Kept separate from rendering so the numbers can be unit
 * tested and reused (e.g. for an on-screen preview) without touching pdfkit.
 */
@Injectable()
export class ReportDataService {
  constructor(private readonly prisma: PrismaService) {}

  /** Number of people a registration represents (group bookings count each). */
  private headcount(groupSize: number | null): number {
    return groupSize && groupSize > 0 ? groupSize : 1;
  }

  private toNum(d: Prisma.Decimal | number | null | undefined): number {
    return d == null ? 0 : Number(d);
  }

  /** WHERE clause for this report's registration set, honouring the window. */
  private registrationWhere(
    eventId: string,
    window: ReportWindow,
  ): Prisma.EventRegistrationWhereInput {
    const registeredAt: Prisma.DateTimeFilter = {};
    if (window.from) registeredAt.gte = window.from;
    if (window.to) registeredAt.lte = window.to;
    return {
      eventId,
      ...(window.from || window.to ? { registeredAt } : {}),
    };
  }

  /**
   * Gather the data for `sections`. One query pulls the registration rows the
   * requested sections need; the derivations below never hit the DB again.
   */
  async gather(
    eventId: string,
    sections: ReportSection[],
    window: ReportWindow,
  ): Promise<ReportData> {
    const wants = new Set(sections);
    const data: ReportData = {};

    const event = await this.prisma.event.findUniqueOrThrow({
      where: { id: eventId },
      select: { capacity: true, waitlistCount: true },
    });

    const registrations = await this.prisma.eventRegistration.findMany({
      where: this.registrationWhere(eventId, window),
      select: {
        groupSize: true,
        status: true,
        paymentStatus: true,
        isWaitlisted: true,
        checkedInAt: true,
        totalAmount: true,
        processingFee: true,
        refundedAmount: true,
        ticketTypeId: true,
        user: {
          select: {
            fullName: true,
            identities: {
              select: { email: true, isPrimary: true },
            },
          },
        },
        ticketType: { select: { name: true } },
      },
      orderBy: { registeredAt: 'desc' },
    });

    // The shared "is this person attending?" predicate, applied in memory so we
    // don't refetch. Confirmed payment, not cancelled, not on the waiting list.
    const isAttending = (r: (typeof registrations)[number]) =>
      r.status !== RegistrationStatus.CANCELLED &&
      !r.isWaitlisted &&
      (r.paymentStatus === PaymentStatus.PAID ||
        r.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED);

    const money = this.computeMoney(registrations);

    if (wants.has(ReportSection.OVERVIEW) || wants.has(ReportSection.REVENUE)) {
      const attendingRegs = registrations.filter(isAttending);
      const attending = attendingRegs.reduce(
        (sum, r) => sum + this.headcount(r.groupSize),
        0,
      );
      const checkedIn = attendingRegs.reduce(
        (sum, r) => (r.checkedInAt ? sum + this.headcount(r.groupSize) : sum),
        0,
      );
      const waitlisted = registrations.filter((r) => r.isWaitlisted).length;

      const overview: ReportOverview = {
        totalRegistrations: registrations.length,
        attending,
        checkedIn,
        waitlisted,
        attendanceRate: attending > 0 ? round1((checkedIn / attending) * 100) : null,
        capacityFill:
          event.capacity && event.capacity > 0
            ? round1((attending / event.capacity) * 100)
            : null,
        ...money,
      };
      if (wants.has(ReportSection.OVERVIEW)) data.overview = overview;
      if (wants.has(ReportSection.REVENUE)) data.revenue = overview;
    }

    if (wants.has(ReportSection.TICKETS)) {
      data.tickets = await this.gatherTickets(eventId, registrations);
    }

    if (wants.has(ReportSection.ATTENDEES)) {
      data.attendees = registrations.filter(isAttending).map((r) => ({
        name: r.user.fullName ?? '—',
        email: primaryEmail(r.user.identities) ?? '—',
        ticket: r.ticketType?.name ?? 'General',
        status: r.status,
        paymentStatus: r.paymentStatus,
        checkedIn: r.checkedInAt != null,
      }));
    }

    if (wants.has(ReportSection.CHECKINS)) {
      const attendingRegs = registrations.filter(isAttending);
      const attending = attendingRegs.reduce(
        (s, r) => s + this.headcount(r.groupSize),
        0,
      );
      const checkedIn = attendingRegs.reduce(
        (s, r) => (r.checkedInAt ? s + this.headcount(r.groupSize) : s),
        0,
      );
      data.checkins = {
        attending,
        checkedIn,
        notCheckedIn: attending - checkedIn,
        rate: attending > 0 ? round1((checkedIn / attending) * 100) : null,
      };
    }

    return data;
  }

  /** Collected / fees / refunded / net over captured rows only. */
  private computeMoney(
    registrations: {
      paymentStatus: PaymentStatus;
      totalAmount: Prisma.Decimal;
      processingFee: Prisma.Decimal;
      refundedAmount: Prisma.Decimal;
    }[],
  ): Pick<ReportOverview, 'collected' | 'fees' | 'refunded' | 'net'> {
    let collected = 0;
    let fees = 0;
    let refunded = 0;
    for (const r of registrations) {
      if (!CAPTURED_STATUSES.includes(r.paymentStatus)) continue;
      collected += this.toNum(r.totalAmount);
      fees += this.toNum(r.processingFee);
      refunded += this.toNum(r.refundedAmount);
    }
    return {
      collected: round2(collected),
      fees: round2(fees),
      refunded: round2(refunded),
      net: round2(collected - fees - refunded),
    };
  }

  /** Per ticket-type: units sold + revenue collected + seats remaining. */
  private async gatherTickets(
    eventId: string,
    registrations: {
      ticketTypeId: string | null;
      paymentStatus: PaymentStatus;
      groupSize: number | null;
      totalAmount: Prisma.Decimal;
    }[],
  ): Promise<TicketRow[]> {
    const types = await this.prisma.eventTicketType.findMany({
      where: { eventId },
      select: { id: true, name: true, price: true, totalQuantity: true },
      orderBy: { order: 'asc' },
    });

    return types.map((t) => {
      const rows = registrations.filter(
        (r) =>
          r.ticketTypeId === t.id &&
          CAPTURED_STATUSES.includes(r.paymentStatus),
      );
      const sold = rows.reduce((s, r) => s + this.headcount(r.groupSize), 0);
      const revenue = rows.reduce((s, r) => s + this.toNum(r.totalAmount), 0);
      return {
        name: t.name,
        price: this.toNum(t.price),
        sold,
        revenue: round2(revenue),
        remaining:
          t.totalQuantity != null ? Math.max(t.totalQuantity - sold, 0) : null,
      };
    });
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function primaryEmail(
  identities: { email: string | null; isPrimary: boolean }[],
): string | null {
  return (
    identities.find((i) => i.isPrimary && i.email)?.email ??
    identities.find((i) => i.email)?.email ??
    null
  );
}
