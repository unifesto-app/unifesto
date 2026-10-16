import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { formatAnswer } from './form-answers.util';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService, platformShare } from '../subscription/plan-config.service';
import { buildExportFile, csvChunks, type ExportFormat } from './export.util';
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
    type: 'attendees' | 'transactions' = 'attendees',
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
      const CAPTURED_STATUSES = new Set([
        'PAID',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
      ]);
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
      // Same fee rule and rounding as the payout figures, so the Net column
      // sums to the event's netEntitlement (bar add-on seats and stays).
      const sharePercent = this.planConfig.resolvePlatformFeePercent(subscription);
      const toRow = (reg: any) => {
        const captured = CAPTURED_STATUSES.has(reg.paymentStatus);
        const gross = Number(reg.totalAmount) || 0;
        const fee = Number(reg.processingFee) || 0;
        const refunded = Number(reg.refundedAmount) || 0;
        const collected = captured ? gross : 0;
        const feeCharged = captured ? fee : 0;
        // A row whose automatic full refund is still due isn't the organiser's.
        const kept = reg.refundDueAt ? 0 : Math.max(0, collected - feeCharged - refunded);
        const platformCut = platformShare(kept, sharePercent);
        const net = kept - platformCut;
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
    const formatResponse = (value: unknown): string => formatAnswer(value);

    // Group members can be stored either as `{ name, email, mobile, gender,
    // customFields }` or as a flat form-response map keyed by form-field id.
    // Normalise both so a member's real name/email/mobile is never blank.
    const labelById: Record<string, string> = Object.fromEntries(
      formFields.map((f) => [f.id, f.label.toLowerCase()]),
    );
    const MEMBER_ALIASES: Record<'name' | 'email' | 'mobile', string[]> = {
      name: ['name', 'full name', 'fullname', 'attendee name'],
      email: ['email', 'e-mail', 'email address'],
      mobile: ['mobile', 'phone', 'mobile number', 'phone number', 'contact'],
    };
    const flattenMember = (m: any): Record<string, unknown> => {
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
    };
    const pickMemberField = (
      flat: Record<string, unknown>,
      aliases: string[],
    ): string => {
      for (const [k, v] of Object.entries(flat)) {
        const value = formatResponse(v).trim();
        if (!value) continue;
        if (aliases.includes(k.toLowerCase()) || aliases.includes(labelById[k]))
          return value;
      }
      return '';
    };

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
        const groupRegIds = (registrations as any[])
          .filter((r) => (r.groupSize ?? 0) > 1)
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
                reg.checkedInAt ? 'Yes' : 'No',
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
}

/**
 * CSV streams page by page; xlsx/pdf are whole-file formats, so their rows are
 * collected and built in memory as before.
 */
async function exportOutput(
  format: ExportFormat,
  title: string,
  header: string[],
  rowPages: AsyncIterable<string[][]>,
  basename: string,
): Promise<{
  contentType: string;
  filename: string;
  stream?: Readable;
  buffer?: Buffer;
}> {
  if (format === 'csv') {
    return {
      stream: Readable.from(csvChunks(header, rowPages)),
      contentType: 'text/csv; charset=utf-8',
      filename: `${basename}.csv`,
    };
  }
  const rows: string[][] = [];
  for await (const page of rowPages) rows.push(...page);
  const file = await buildExportFile(format, title, header, rows);
  return {
    buffer: file.buffer,
    contentType: file.contentType,
    filename: `${basename}.${file.extension}`,
  };
}
