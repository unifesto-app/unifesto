import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { formatAnswer } from './form-answers.util';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { settleRow } from '../payouts/settle';
import { csvChunks, pdfStream, xlsxChunks, type ExportFormat } from './export.util';
import { Readable } from 'stream';
import { pages } from '../common/batching';
import { Action, AuthorizationService } from '../auth/authorization';

/** The organiser attendee export (CSV / XLSX / PDF), one row per seat for groups. */
@Injectable()
export class RegistrationExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly authz: AuthorizationService,
  ) {}

  async exportRegistrations(
    userId: string,
    eventId: string,
    format: ExportFormat = 'csv',
    type: ExportType = 'attendees',
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        space: {
          include: { subscription: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const subscription = event.space.subscription;
    if (!subscription) {
      throw new BadRequestException('This space has no subscription');
    }
    const planLimits = this.planConfig.getEffectiveLimits(subscription);
    if (!planLimits.hasBulkExport) {
      throw new BadRequestException('Bulk export not available in your plan');
    }

    if (!(await this.authz.can({ id: userId }, Action.EVENT_MANAGE_ATTENDEES, { eventId: event.id }))) {
      throw new ForbiddenException('Unauthorized');
    }

    // Registrations are read a page at a time (newest first, as before), so a
    // CSV streams out while it is read rather than being built whole.
    const prisma = this.prisma;
    const registrationPages = () =>
      pages((page) =>
        prisma.eventRegistration.findMany({
          ...page,
          where: { eventId },
          orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
          include: {
            user: {
              select: {
                fullName: true,
                username: true,
                mobileNumber: true,
                identities: {
                  select: { email: true },
                  take: 1,
                },
              },
            },
            ticketType: true,
          },
        }),
      );

    // Transactions export: payment/transaction data only, and only rows where
    // money actually moved (free RSVPs are excluded).
    if (type === 'transactions') {
      const isTxn = (reg: any) =>
        Number(reg.totalAmount) > 0 || reg.paymentId || reg.orderId;
      // Money model (all in INR, stored as Decimal):
      //   totalAmount   = base ticket price + processingFee  (the FULL amount
      //                   the attendee was charged)
      //   processingFee = platform/gateway fee — retained, never refunded
      //   refundedAmount= amount returned to the attendee (base-only policy)
      //
      // A single "Amount" column conflated all of this, so an organiser reading
      // the export couldn't tell gross cash-in from fees from take-home. We now
      // break it into the same figures the dashboard tiles show:
      //   Collected = gross the attendee actually paid (only when captured)
      //   Fee       = platform's cut
      //   Refunded  = returned to the attendee
      //   Platform Fee = revenue-share cut of what's kept (0 off revenue share)
      //   Net       = what the organiser keeps = Collected − Fee − Refunded − Platform Fee
      //
      // PENDING/FAILED rows moved no money, so their Collected/Fee are 0 (they
      // stay in the export for the audit trail, but never inflate the totals).
      // Net is cash-accurate: Net = Collected − Fee − Refunded, using the
      // amounts ACTUALLY captured. This handles every status correctly and can
      // never go negative (the refund is base-only, i.e. ≤ Collected − Fee):
      //   - PENDING / FAILED → nothing captured → Collected/Fee/Net = 0.
      //   - REFUNDED / PARTIALLY_REFUNDED → the Refunded column is subtracted,
      //     so a full refund nets to 0 and a partial refund nets the retained
      //     part.
      //   - CANCELLED but already refunded → nets to 0. CANCELLED but the
      //     refund hasn't been processed yet (payment still PAID) → nets the
      //     base, which is genuine cash the organiser is still holding and owes
      //     back, NOT phantom revenue. The new Registration Status column makes
      //     that visible so the figure is never mistaken for a clean sale.
      const header = [
        'Name',
        'Email',
        'Ticket Type',
        'Registration Status',
        'Collected (INR)',
        'Processing Fee (INR)',
        'Refunded (INR)',
        'Platform Fee (INR)',
        'Net (INR)',
        'Payment Status',
        'Payment ID',
        'Order ID',
        'Paid At',
      ];
      // settleRow: the payout figures' own rule, at the fee frozen on each
      // sale, so the Net column sums to the event's netEntitlement (bar add-on
      // seats, stays and a paisa of per-row rounding).
      const sharePercent = this.planConfig.resolvePlatformFeePercent(subscription);
      const toRow = (reg: any) => {
        const { collected, buyerFee: feeCharged, refunded, platformFee: platformCut, net } =
          settleRow(reg, sharePercent);
        return [
          reg.user.fullName || '',
          reg.user.identities?.[0]?.email || '',
          reg.ticketType?.name || 'RSVP',
          reg.status,
          collected.toFixed(2),
          feeCharged.toFixed(2),
          refunded.toFixed(2),
          platformCut.toFixed(2),
          net.toFixed(2),
          reg.paymentStatus,
          reg.paymentId || '',
          reg.orderId || '',
          reg.paidAt ? reg.paidAt.toISOString() : '',
        ];
      };

      async function* txnPages() {
        for await (const regs of registrationPages()) {
          yield regs.filter(isTxn).map(toRow);
        }
      }
      return exportOutput(
        format,
        `${event.title} — Transactions`,
        header,
        txnPages(),
        `${event.slug}-transactions`,
      );
    }

    if (type === 'waitlist') return this.waitlistExport(event, format);
    if (type === 'checkins') return this.checkinExport(event, format);
    if (type === 'coupons') return this.couponExport(event, format);

    // Attendees export: full attendee data plus the custom form responses.
    // Responses are keyed by form-field id, so we resolve the id → label map to
    // give each custom field its own labelled column.
    // Section headings are never answered, so they get no column.
    const formFields = await this.prisma.eventFormField.findMany({
      where: { eventId, type: { not: 'SECTION' } },
      orderBy: { order: 'asc' },
      select: { id: true, label: true },
    });

    // Yes/No as words, picks joined, a file by its name (files themselves
    // are opened from the attendee page with a short-lived link).
    const formatResponse = formatAnswer;

    const labelById = labelMap(formFields);
    const pickMemberField = (flat: Record<string, unknown>, aliases: string[]) =>
      pickField(flat, aliases, labelById);

    const header = [
      'Name',
      'Username',
      'Email',
      'Mobile',
      'Ticket Type',
      'Quantity',
      'Status',
      'Payment',
      'Amount (INR)',
      'Registered At',
      'Checked In',
      'Group',
      ...formFields.map((f) => f.label),
    ];

    // One page of registrations at a time; seats are fetched per page.
    async function* attendeePages() {
      for await (const registrations of registrationPages()) {
        // Group seats are the group's roster (S42). Fetch all seats
        // for the group registrations in one query, with the claimer's account for
        // fallback identity.
        // An unpaid checkout (PENDING / FAILED) already has seats (S42) but
        // stays one lead row: its typed-in members aren't attendees yet.
        const groupRegIds = (registrations as any[])
          .filter(
            (r) =>
              (r.groupSize ?? 0) > 1 &&
              r.paymentStatus !== PaymentStatus.PENDING &&
              r.paymentStatus !== PaymentStatus.FAILED,
          )
          .map((r) => r.id);
        const allSeats = groupRegIds.length
          ? await prisma.groupSeat.findMany({
              where: { registrationId: { in: groupRegIds } },
              orderBy: [{ registrationId: 'asc' }, { seatIndex: 'asc' }],
              include: {
                claimedBy: {
                  select: {
                    fullName: true,
                    username: true,
                    mobileNumber: true,
                    identities: { select: { email: true }, take: 1 },
                  },
                },
              },
            })
          : [];
        // Who in each group is checked in (anywhere): per member, never the
        // registration's own flag, which is set once any one member is in.
        const memberIn = new Set(
          (groupRegIds.length
            ? await prisma.eventGroupMemberCheckin.findMany({
                where: { registrationId: { in: groupRegIds } },
                select: { registrationId: true, memberIndex: true },
                distinct: ['registrationId', 'memberIndex'],
              })
            : []
          ).map((m) => `${m.registrationId}:${m.memberIndex}`),
        );
        const groupHasMemberCheckins = new Set([...memberIn].map((k) => k.split(':')[0]));
        const seatsByReg = new Map<string, typeof allSeats>();
        for (const s of allSeats) {
          const list = seatsByReg.get(s.registrationId) ?? [];
          list.push(s);
          seatsByReg.set(s.registrationId, list);
        }

        const seatStatusLabel = (status: string) =>
          status.charAt(0) + status.slice(1).toLowerCase(); // OPEN → Open

        // A GROUP registration is a single row whose `user` is only the team lead;
        // the whole team lives in seat rows. Expand
        // each such registration into one row per seat so no attendee is
        // hidden. To keep the Amount column summable, the payment amount is
        // attributed to seat 1 (the lead) only.
        const rows: string[][] = [];
        for (const reg of registrations as any[]) {
          const responses = (reg.formResponses ?? {}) as Record<string, unknown>;
          const seats = seatsByReg.get(reg.id) ?? [];
          const isGroup = (reg.groupSize ?? 0) > 1 && seats.length > 0;

          if (isGroup) {
            // One row per seat, with claim status.
            for (const seat of seats) {
              const md = (seat.memberDetails ?? {}) as any;
              const flat = flattenMember(md);
              const custom = (md?.customFields ?? {}) as Record<string, unknown>;
              const isLead = seat.seatIndex === 1;
              const claimer = seat.claimedBy;
              const label = isLead ? 'Lead' : seatStatusLabel(seat.status);
              rows.push([
                pickMemberField(flat, MEMBER_ALIASES.name) ||
                  claimer?.fullName ||
                  (isLead ? reg.user.fullName || '' : ''),
                claimer?.username || (isLead ? reg.user.username || '' : ''),
                pickMemberField(flat, MEMBER_ALIASES.email) ||
                  claimer?.identities?.[0]?.email ||
                  (isLead ? reg.user.identities?.[0]?.email || '' : ''),
                pickMemberField(flat, MEMBER_ALIASES.mobile) ||
                  claimer?.mobileNumber ||
                  (isLead ? reg.user.mobileNumber || '' : ''),
                reg.ticketType?.name || 'RSVP',
                '1',
                reg.status,
                reg.paymentStatus,
                isLead ? Number(reg.totalAmount).toString() : '0',
                reg.registeredAt.toISOString(),
                memberIn.has(`${reg.id}:${seat.seatIndex - 1}`) ||
                // A whole-group check-in from before per-member records: the lead.
                (isLead && reg.checkedInAt && !groupHasMemberCheckins.has(reg.id))
                  ? 'Yes'
                  : 'No',
                `Group of ${reg.groupSize} · Seat ${seat.seatIndex} · ${label}`,
                ...formFields.map((f) =>
                  formatResponse(custom[f.id] ?? (isLead ? responses[f.id] : undefined)),
                ),
              ]);
            }
          } else {
            rows.push([
              reg.user.fullName || '',
              reg.user.username || '',
              reg.user.identities?.[0]?.email || '',
              reg.user.mobileNumber || '',
              reg.ticketType?.name || 'RSVP',
              reg.quantity.toString(),
              reg.status,
              reg.paymentStatus,
              Number(reg.totalAmount).toString(),
              reg.registeredAt.toISOString(),
              reg.checkedInAt ? 'Yes' : 'No',
              '',
              ...formFields.map((f) => formatResponse(responses[f.id])),
            ]);
          }
        }
        yield rows;
      }
    }

    return exportOutput(
      format,
      `${event.title} — Attendees`,
      header,
      attendeePages(),
      `${event.slug}-attendees`,
    );
  }

  /** Everyone who joined the waiting list, in queue order, with where they are now. */
  private waitlistExport(event: ExportEvent, format: ExportFormat) {
    const prisma = this.prisma;
    const header = ['Name', 'Email', 'Mobile', 'Ticket Type', 'Waitlist Status', 'Joined At', 'Offered At', 'Offer Expires At', 'Registration Status'];
    async function* rows() {
      const regPages = pages((page) =>
        prisma.eventRegistration.findMany({
          ...page,
          where: { eventId: event.id, waitlistStatus: { not: null } },
          orderBy: [{ waitlistedAt: 'asc' }, { id: 'asc' }],
          include: { user: userSelect, ticketType: { select: { name: true } } },
        }),
      );
      for await (const regs of regPages) {
        yield regs.map((r) => [
          r.user.fullName || '',
          r.user.identities?.[0]?.email || '',
          r.user.mobileNumber || '',
          r.ticketType?.name || 'RSVP',
          r.waitlistStatus ?? '',
          iso(r.waitlistedAt),
          iso(r.waitlistOfferedAt),
          iso(r.waitlistOfferExpiresAt),
          r.status,
        ]);
      }
    }
    return exportOutput(format, `${event.title} — Waiting list`, header, rows(), `${event.slug}-waitlist`);
  }

  /**
   * Every check-in at every point. A group checked in member by member lists
   * the members; its registration-level record at that point is then just the
   * summary and is left out (same rule as the live "recent" feed).
   */
  private async checkinExport(event: ExportEvent, format: ExportFormat) {
    const prisma = this.prisma;
    const header = ['Name', 'Email', 'Ticket Type', 'Group Lead', 'Seat', 'Check-in Point', 'Checked In At', 'Recorded At', 'Checked In By'];
    const where = { registration: { eventId: event.id } };
    // ponytail: holds one key per member check-in in memory; fine into the tens of thousands.
    const memberKeys = new Set(
      (
        await prisma.eventGroupMemberCheckin.findMany({ where, select: { registrationId: true, checkinTypeId: true } })
      ).map((m) => `${m.registrationId}:${m.checkinTypeId}`),
    );
    const labelById = labelMap(
      await prisma.eventFormField.findMany({ where: { eventId: event.id }, select: { id: true, label: true } }),
    );
    const by = (u: { fullName: string | null; username: string | null } | null) => u?.fullName || u?.username || '';
    const reg = { select: { user: userSelect, ticketType: { select: { name: true } } } };
    const order = [{ checkedInAt: 'asc' as const }, { id: 'asc' as const }];
    async function* rows() {
      const recordPages = pages((page) =>
        prisma.eventCheckinRecord.findMany({
          ...page,
          where,
          orderBy: order,
          include: { registration: reg, checkinType: { select: { name: true } }, checkedInByUser: { select: { fullName: true, username: true } } },
        }),
      );
      for await (const recs of recordPages) {
        yield recs
          .filter((r) => !memberKeys.has(`${r.registrationId}:${r.checkinTypeId}`))
          .map((r) => [
            by(r.registration.user),
            r.registration.user.identities?.[0]?.email || '',
            r.registration.ticketType?.name || 'RSVP',
            '',
            '',
            r.checkinType.name,
            r.checkedInAt.toISOString(),
            r.recordedAt.toISOString(),
            by(r.checkedInByUser),
          ]);
      }
      const memberPages = pages((page) =>
        prisma.eventGroupMemberCheckin.findMany({
          ...page,
          where,
          orderBy: order,
          include: {
            registration: reg,
            checkinType: { select: { name: true } },
            checkedInByUser: { select: { fullName: true, username: true } },
            groupSeat: {
              select: {
                seatIndex: true,
                memberDetails: true,
                claimedBy: { select: { fullName: true, username: true, identities: { select: { email: true }, take: 1 } } },
              },
            },
          },
        }),
      );
      for await (const members of memberPages) {
        yield members.map((m) => {
          const seat = m.groupSeat;
          const flat = flattenMember(seat?.memberDetails);
          const lead = by(m.registration.user);
          const isLead = (seat?.seatIndex ?? m.memberIndex + 1) === 1;
          return [
            pickField(flat, MEMBER_ALIASES.name, labelById) || by(seat?.claimedBy ?? null) || (isLead ? lead : ''),
            pickField(flat, MEMBER_ALIASES.email, labelById) ||
              seat?.claimedBy?.identities?.[0]?.email ||
              (isLead ? m.registration.user.identities?.[0]?.email || '' : ''),
            m.registration.ticketType?.name || 'RSVP',
            lead,
            String(seat?.seatIndex ?? m.memberIndex + 1),
            m.checkinType.name,
            m.checkedInAt.toISOString(),
            m.recordedAt.toISOString(),
            by(m.checkedInByUser),
          ];
        });
      }
    }
    return exportOutput(format, `${event.title} — Check-ins`, header, rows(), `${event.slug}-checkins`);
  }

  /** Every coupon use: held mid-checkout (Reserved) or settled (Confirmed). */
  private couponExport(event: ExportEvent, format: ExportFormat) {
    const prisma = this.prisma;
    const header = ['Coupon Code', 'Name', 'Email', 'Ticket Type', 'Discount (INR)', 'Redemption Status', 'Registration Status', 'Payment Status', 'Redeemed At'];
    async function* rows() {
      const redemptionPages = pages((page) =>
        prisma.couponRedemption.findMany({
          ...page,
          where: { coupon: { eventId: event.id } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            coupon: { select: { code: true } },
            user: userSelect,
            registration: { select: { status: true, paymentStatus: true, ticketType: { select: { name: true } } } },
          },
        }),
      );
      for await (const reds of redemptionPages) {
        yield reds.map((r) => [
          r.coupon.code,
          r.user.fullName || '',
          r.user.identities?.[0]?.email || '',
          r.registration.ticketType?.name || 'RSVP',
          Number(r.discountAmount).toFixed(2),
          r.status,
          r.registration.status,
          r.registration.paymentStatus,
          r.createdAt.toISOString(),
        ]);
      }
    }
    return exportOutput(format, `${event.title} — Coupon redemptions`, header, rows(), `${event.slug}-coupons`);
  }
}

export type ExportType = 'attendees' | 'transactions' | 'waitlist' | 'checkins' | 'coupons';
type ExportEvent = { id: string; title: string; slug: string };

const userSelect = {
  select: { fullName: true, username: true, mobileNumber: true, identities: { select: { email: true }, take: 1 } },
};

const iso = (d: Date | null) => (d ? d.toISOString() : '');

/** Form-field id → lowercased label, to read member answers keyed by field id. */
function labelMap(fields: { id: string; label: string }[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.id, f.label.toLowerCase()]));
}

// Group members can be stored either as `{ name, email, mobile, gender,
// customFields }` or as a flat form-response map keyed by form-field id.
// Normalise both so a member's real name/email/mobile is never blank.
const MEMBER_ALIASES: Record<'name' | 'email' | 'mobile', string[]> = {
  name: ['name', 'full name', 'fullname', 'attendee name'],
  email: ['email', 'e-mail', 'email address'],
  mobile: ['mobile', 'phone', 'mobile number', 'phone number', 'contact'],
};

function flattenMember(m: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  if (m && typeof m === 'object') {
    for (const [k, v] of Object.entries(m)) {
      if (k === 'customFields' && v && typeof v === 'object') {
        Object.assign(flat, v as Record<string, unknown>);
      } else {
        flat[k] = v;
      }
    }
  }
  return flat;
}

function pickField(flat: Record<string, unknown>, aliases: string[], labelById: Record<string, string>): string {
  for (const [k, v] of Object.entries(flat)) {
    const value = formatAnswer(v).trim();
    if (!value) continue;
    if (aliases.includes(k.toLowerCase()) || aliases.includes(labelById[k])) return value;
  }
  return '';
}

/** Every format streams page by page (S54). */
async function exportOutput(
  format: ExportFormat,
  title: string,
  header: string[],
  rowPages: AsyncIterable<string[][]>,
  basename: string,
): Promise<{
  contentType: string;
  filename: string;
  stream: Readable;
}> {
  if (format === 'xlsx') {
    return {
      stream: Readable.from(xlsxChunks(header, rowPages, title)),
      contentType: 'application/vnd.ms-excel',
      filename: `${basename}.xls`,
    };
  }
  if (format === 'pdf') {
    return {
      stream: pdfStream(header, rowPages, title),
      contentType: 'application/pdf',
      filename: `${basename}.pdf`,
    };
  }
  return {
    stream: Readable.from(csvChunks(header, rowPages)),
    contentType: 'text/csv; charset=utf-8',
    filename: `${basename}.csv`,
  };
}
