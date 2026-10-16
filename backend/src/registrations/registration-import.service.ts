import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { enforceFormAnswers } from './form-answers.policy';
import { checkAnswers, type FormFieldLike } from './form-answers.util';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { PaymentsService } from '../payments/payments.service';
import { takeSeats, SoldOutError } from './capacity.util';
import { buildExportFile } from './export.util';
import {
  buildTemplateSpec,
  parseCsv,
  parseImportRows,
  type ImportTicketShape,
  type ParsedImportRow,
} from './manual-import.util';
import { PaymentStatus, RegistrationStatus, Prisma, Provider, FormFieldType } from '@prisma/client';
import { GroupSeatsService } from './group-seats.service';
import * as crypto from 'crypto';
import { generateQRCode, generateTicketCode } from './registration.util';
import { RegistrationConfirmationsService } from './registration-confirmations.service';

/** Curator-added attendees: bulk CSV import (template, preview, import) and the single manual add. */
@Injectable()
export class RegistrationImportService {
  // Same log context as before the split, so log searches keep working.
  private readonly logger = new Logger('RegistrationsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly platformConfig: PlatformConfigService,
    private readonly payments: PaymentsService,
    private readonly groupSeats: GroupSeatsService,
    private readonly confirmations: RegistrationConfirmationsService,
  ) {}

  /**
   * Load an event + one of its ticket types (with custom form fields) for the
   * attendee-management flows, or throw. Shared by the template, import and
   * single-add paths so they agree on what a valid target is.
   */
  /**
   * Refuse organiser-driven attendee changes (import / manual add) once the
   * admin-configured post-event action window has closed. Shares the exact
   * deadline used for certificate issuance so both surfaces close together.
   */
  private assertAttendeeActionsOpen(endDateTime: Date) {
    if (!this.platformConfig.isWithinPostEventWindow(endDateTime)) {
      const days = this.platformConfig.getPostEventActionWindowDays();
      throw new ForbiddenException(
        `Adding attendees closed ${days} day${days === 1 ? '' : 's'} after this event ended.`,
      );
    }
  }

  private async loadEventTicketForManage(eventId: string, ticketTypeId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Event not found');

    const ticketType = await this.prisma.eventTicketType.findFirst({
      where: { id: ticketTypeId, eventId },
      include: { formFields: { orderBy: { order: 'asc' } } },
    });
    if (!ticketType) throw new NotFoundException('Ticket type not found');

    return { event, ticketType };
  }

  /** Reduce a ticket type + its form fields to the pure import contract. */
  private toImportShape(ticketType: {
    kind: string;
    minGroupSize: number | null;
    maxGroupSize: number | null;
    formFields: {
      id: string;
      label: string;
      type: FormFieldType;
      isRequired: boolean;
      perGroup: boolean;
      showIf: Prisma.JsonValue;
    }[];
  }): ImportTicketShape {
    return {
      kind: ticketType.kind as ImportTicketShape['kind'],
      minGroupSize: ticketType.minGroupSize,
      maxGroupSize: ticketType.maxGroupSize,
      // Headings have no answer and files can't come from a spreadsheet, so
      // neither gets a column. A conditional question is never forced: whether
      // it applies depends on another answer in the same row.
      formFields: ticketType.formFields
        .filter((f) => f.type !== 'SECTION' && f.type !== 'FILE')
        .map((f) => ({
          id: f.id,
          label: f.label,
          required: f.isRequired && !f.showIf,
          perGroup: f.perGroup,
        })),
    };
  }

  /**
   * Run the answer policy over parsed CSV rows: each row's answers are typed
   * and limit-checked (required is the importer's job, above). A bad answer
   * marks just that row as errored instead of failing the whole file.
   */
  private checkImportAnswers(
    eventId: string,
    ticketType: { kind: string; formFields: FormFieldLike[] },
    rows: ParsedImportRow[],
  ) {
    const isGroup = ticketType.kind === 'GROUP';
    const fields = ticketType.formFields;
    const teamFields = isGroup ? fields.filter((f) => f.perGroup) : fields;
    const memberFields = isGroup ? fields.filter((f) => !f.perGroup) : [];
    const opts = { eventId, enforceRequired: false, uploaderIds: [] };
    for (const row of rows) {
      if (row.error) continue;
      const team = checkAnswers(teamFields, row.formResponses, opts);
      const errors = [...team.errors];
      row.formResponses = team.answers;
      for (const m of row.groupMembers ?? []) {
        const r = checkAnswers(memberFields, m.customFields, opts);
        errors.push(...r.errors);
        m.customFields = r.answers;
      }
      if (errors.length) row.error = errors.slice(0, 2).join(' ');
    }
  }

  /**
   * The CSV template for one ticket type. Columns are derived from the ticket's
   * kind (group tickets get member columns) and its custom form fields, so what
   * an organiser downloads always matches what the importer reads back.
   */
  async buildImportTemplate(eventId: string, ticketTypeId: string) {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    const spec = buildTemplateSpec(this.toImportShape(ticketType));
    const { buffer } = await buildExportFile(
      'csv',
      `${ticketType.name} attendees`,
      spec.header,
      [spec.sample],
    );
    const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    return {
      buffer,
      filename: `${safe(event.slug)}-${safe(ticketType.name)}-template.csv`,
    };
  }

  /**
   * Find an account by its email identity, or mint a claimable placeholder one.
   *
   * Accounts here are keyed by mobile, not email, so a fresh import row has no
   * real account and no phone number. We reuse the exact pattern auth uses for
   * email/OAuth sign-ups: create a User with a synthetic placeholder mobile plus
   * an EMAIL identity carrying the real address. When that person later signs in
   * with the same email, auth resolves them by email identity and links — the
   * imported registration is already theirs, no merge tooling needed.
   *
   * The provided mobile is deliberately NOT used as the account's mobileNumber:
   * it is unverified, may be a typo, and claiming a real number could block that
   * person's genuine sign-up. It rides along on the registration/group data only.
   */
  private async findOrCreateUserByEmail(
    email: string,
    name: string,
  ): Promise<string> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.userIdentity.findFirst({
      where: { email: normalized },
      select: { userId: true, user: { select: { fullName: true } } },
    });
    if (existing) {
      // Backfill a display name if the account never had one (e.g. a bare
      // placeholder created by an earlier import).
      if (!existing.user?.fullName && name) {
        await this.prisma.user
          .update({ where: { id: existing.userId }, data: { fullName: name } })
          .catch(() => undefined);
      }
      return existing.userId;
    }

    // Collision-safe placeholder: random 9 digits (not Date.now, which repeats
    // inside a tight import loop). Retried a few times on the tiny chance of a
    // unique clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      const placeholderMobile = `+0${crypto.randomInt(100000000, 999999999)}`;
      try {
        const user = await this.prisma.user.create({
          data: {
            mobileNumber: placeholderMobile,
            mobileVerified: false,
            fullName: name || null,
            identities: {
              create: {
                provider: Provider.EMAIL,
                providerUserId: normalized,
                email: normalized,
                emailVerified: false,
                isPrimary: true,
              },
            },
          },
          select: { id: true },
        });
        return user.id;
      } catch (err) {
        // A concurrent create may have won the email identity race — re-resolve.
        const raced = await this.prisma.userIdentity.findFirst({
          where: { email: normalized },
          select: { userId: true },
        });
        if (raced) return raced.userId;
        if (attempt === 4) throw err; // exhausted placeholder retries
      }
    }
    // Unreachable, but satisfies the type checker.
    throw new BadRequestException(`Could not resolve an account for ${email}`);
  }

  /**
   * Read-only counterpart to {@link findOrCreateUserByEmail}: resolve an existing
   * account by its email identity, or `null` if none exists yet. Used by the
   * import preview (dry-run), which must never create the placeholder accounts the
   * real import would — a `null` here is what tells the reviewer "this row would
   * create a brand-new account".
   */
  private async resolveUserIdByEmail(email: string): Promise<string | null> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.userIdentity.findFirst({
      where: { email: normalized },
      select: { userId: true },
    });
    return existing?.userId ?? null;
  }

  /**
   * Decide what an import will do with one parsed row, WITHOUT writing anything.
   * This is the single source of truth shared by the dry-run preview and the real
   * import, so the review a curator approves always matches what actually happens.
   *
   * `state` is mutated across the batch: `seen` catches duplicate emails within
   * the file, and `remaining` is the capacity the caller decrements once a row is
   * committed (on decision here for the preview, on successful create for import).
   */
  private async classifyImportRow(
    eventId: string,
    ticketTypeId: string,
    row: ParsedImportRow,
    state: { remaining: number | null; seen: Set<string> },
  ): Promise<
    | { decision: 'create'; seats: number; existingUserId: string | null }
    | { decision: 'skip' | 'error'; reason: string }
  > {
    if (row.error) return { decision: 'error', reason: row.error };
    if (state.seen.has(row.email)) {
      return { decision: 'skip', reason: 'Duplicate email within this file.' };
    }
    state.seen.add(row.email);

    const seats = row.groupSize && row.groupSize > 1 ? row.groupSize : 1;
    if (state.remaining != null && seats > state.remaining) {
      return {
        decision: 'error',
        reason: `Not enough capacity left (need ${seats}, ${state.remaining} remaining).`,
      };
    }

    const existingUserId = await this.resolveUserIdByEmail(row.email);
    if (
      existingUserId &&
      (await this.hasActiveRegistration(eventId, existingUserId, ticketTypeId))
    ) {
      return { decision: 'skip', reason: 'Already registered for this ticket.' };
    }
    return { decision: 'create', seats, existingUserId };
  }

  /**
   * Is this (event, user, ticketType) already an active registration? Mirrors the
   * partial unique index: REFUNDED / CANCELLED rows don't count, so a previously
   * cancelled attendee can be re-added.
   */
  private async hasActiveRegistration(
    eventId: string,
    userId: string,
    ticketTypeId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.eventRegistration.findFirst({
      where: {
        eventId,
        userId,
        ticketTypeId,
        status: { not: RegistrationStatus.CANCELLED },
        paymentStatus: { not: PaymentStatus.REFUNDED },
      },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * Create one confirmed (comped, zero-amount) registration in a transaction:
   * the row, seat/registered counters, per-ticket rows and group seats. Used by
   * bulk import and by the comp branch of single-add. Payment is never involved
   * here — a manually added attendee is free.
   */
  private async createComplimentaryRegistration(
    eventId: string,
    userId: string,
    ticketTypeId: string,
    opts: {
      groupSize: number | null;
      groupMembers: unknown[] | null;
      formResponses: Record<string, unknown>;
    },
  ): Promise<string> {
    const qrCode = generateQRCode();
    const seats = opts.groupSize && opts.groupSize > 1 ? opts.groupSize : 1;

    const registration = await this.prisma.$transaction(async (tx) => {
      const reg = await tx.eventRegistration.create({
        data: {
          eventId,
          userId,
          ticketTypeId,
          quantity: 1,
          groupSize: opts.groupSize,
          totalAmount: new Prisma.Decimal(0),
          paymentStatus: PaymentStatus.PAID,
          paidAt: new Date(),
          qrCode,
          formResponses: opts.formResponses as Prisma.InputJsonValue,
        },
      });

      await takeSeats(tx, { eventId, ticketTypeId }, seats, 'Not enough seats left on this ticket type.');
      await tx.eventTicket.create({
        data: {
          registrationId: reg.id,
          ticketCode: generateTicketCode(),
          qrCode: generateQRCode(),
        },
      });
      await this.groupSeats.createSeatsForRegistration(tx, {
        registrationId: reg.id,
        leadUserId: userId,
        seatCount: seats,
        groupMembers: opts.groupMembers ?? null,
      });
      return reg;
    });


    return registration.id;
  }

  /**
   * Bulk-import attendees for one ticket type from an uploaded CSV. No payment is
   * taken — every imported attendee is comped. Enforces the ticket's remaining
   * capacity across the batch, skips duplicates (already-registered emails), and
   * returns a per-row report so the organiser sees exactly what happened.
   */
  async importAttendees(
    eventId: string,
    ticketTypeId: string,
    csvText: string,
    sendEmails: boolean,
  ): Promise<{
    ticketTypeName: string;
    total: number;
    created: number;
    skipped: number;
    errored: number;
    rows: Array<{
      line: number;
      name: string;
      email: string;
      status: 'created' | 'skipped' | 'errored';
      reason?: string;
    }>;
  }> {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);
    const shape = this.toImportShape(ticketType);
    const { rows: parsed, fileError } = parseImportRows(shape, parseCsv(csvText));
    if (fileError) throw new BadRequestException(fileError);
    this.checkImportAnswers(eventId, ticketType, parsed);
    if (parsed.length === 0) {
      throw new BadRequestException('No attendee rows found in the file.');
    }

    // Remaining capacity for this batch (null = unlimited). A group consumes its
    // whole size; individuals consume one seat.
    const remaining: number | null =
      ticketType.totalQuantity == null
        ? null
        : Math.max(0, ticketType.totalQuantity - ticketType.soldCount);

    const report: Array<{
      line: number;
      name: string;
      email: string;
      status: 'created' | 'skipped' | 'errored';
      reason?: string;
    }> = [];
    // Shared batch state: `seen` de-dupes emails within the file, `remaining`
    // tracks capacity as we go. Same classifier the preview uses, so the report
    // matches whatever the curator reviewed.
    const state = { remaining, seen: new Set<string>() };

    for (const row of parsed) {
      const verdict = await this.classifyImportRow(
        eventId,
        ticketTypeId,
        row,
        state,
      );
      if (verdict.decision !== 'create') {
        report.push({
          ...this.rowHead(row),
          status: verdict.decision === 'error' ? 'errored' : 'skipped',
          reason: verdict.reason,
        });
        continue;
      }

      try {
        const userId = await this.findOrCreateUserByEmail(row.email, row.name);
        const registrationId = await this.createComplimentaryRegistration(
          eventId,
          userId,
          ticketTypeId,
          {
            groupSize: row.groupSize,
            groupMembers: row.groupMembers,
            formResponses: row.formResponses,
          },
        );
        if (state.remaining != null) state.remaining -= verdict.seats;
        if (sendEmails) {
          // Fire-and-forget: a slow SMTP hop must not stall a large import.
          void this.confirmations.sendRegistrationConfirmations(registrationId).catch((err) =>
            this.logger.error(`sendRegistrationConfirmations(${registrationId}) failed: ${err instanceof Error ? err.message : String(err)}`),
          );
        }
        report.push({ ...this.rowHead(row), status: 'created' });
      } catch (err) {
        this.logger.error(
          `import: row ${row.line} (${row.email}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        report.push({
          ...this.rowHead(row),
          status: 'errored',
          reason: err instanceof SoldOutError ? err.message : 'Could not create the registration.',
        });
      }
    }

    await this.cache.invalidateCheckinCache(eventId).catch(() => undefined);

    return {
      ticketTypeName: ticketType.name,
      total: report.length,
      created: report.filter((r) => r.status === 'created').length,
      skipped: report.filter((r) => r.status === 'skipped').length,
      errored: report.filter((r) => r.status === 'errored').length,
      rows: report,
    };
  }

  private rowHead(row: ParsedImportRow) {
    return { line: row.line, name: row.name, email: row.email };
  }

  /**
   * Dry-run a bulk import: parse + validate the CSV and predict, row by row, what
   * the real import would do — WITHOUT creating any accounts or registrations.
   * Reuses {@link classifyImportRow}, the same verdict logic the live import runs,
   * so the review a curator sees here is exactly what committing will produce.
   *
   * `outcome` is `create` (a registration will be added — `newAccount` flags when
   * that also mints a fresh account), `skip` (duplicate / already registered) or
   * `error` (bad row / no capacity).
   */
  async previewImport(
    eventId: string,
    ticketTypeId: string,
    csvText: string,
  ): Promise<{
    ticketTypeName: string;
    total: number;
    willCreate: number;
    willSkip: number;
    willError: number;
    newAccounts: number;
    remainingCapacity: number | null;
    rows: Array<{
      line: number;
      name: string;
      email: string;
      outcome: 'create' | 'skip' | 'error';
      newAccount?: boolean;
      reason?: string;
    }>;
  }> {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);
    const shape = this.toImportShape(ticketType);
    const { rows: parsed, fileError } = parseImportRows(shape, parseCsv(csvText));
    if (fileError) throw new BadRequestException(fileError);
    this.checkImportAnswers(eventId, ticketType, parsed);
    if (parsed.length === 0) {
      throw new BadRequestException('No attendee rows found in the file.');
    }

    const remainingCapacity: number | null =
      ticketType.totalQuantity == null
        ? null
        : Math.max(0, ticketType.totalQuantity - ticketType.soldCount);
    const state = { remaining: remainingCapacity, seen: new Set<string>() };

    const rows: Array<{
      line: number;
      name: string;
      email: string;
      outcome: 'create' | 'skip' | 'error';
      newAccount?: boolean;
      reason?: string;
    }> = [];

    for (const row of parsed) {
      const verdict = await this.classifyImportRow(
        eventId,
        ticketTypeId,
        row,
        state,
      );
      if (verdict.decision === 'create') {
        // The preview has no create to succeed/fail, so charge capacity on the
        // decision — this is what makes a later row overflow show as an error.
        if (state.remaining != null) state.remaining -= verdict.seats;
        rows.push({
          ...this.rowHead(row),
          outcome: 'create',
          newAccount: verdict.existingUserId == null,
        });
      } else {
        rows.push({
          ...this.rowHead(row),
          outcome: verdict.decision,
          reason: verdict.reason,
        });
      }
    }

    return {
      ticketTypeName: ticketType.name,
      total: rows.length,
      willCreate: rows.filter((r) => r.outcome === 'create').length,
      willSkip: rows.filter((r) => r.outcome === 'skip').length,
      willError: rows.filter((r) => r.outcome === 'error').length,
      newAccounts: rows.filter((r) => r.outcome === 'create' && r.newAccount)
        .length,
      remainingCapacity,
      rows,
    };
  }

  /**
   * Manually add a single attendee. When the ticket is free (or the organiser
   * comps it) the attendee is confirmed immediately. When `collectPayment` is set
   * on a paid ticket, a PENDING registration is created and Razorpay emails/texts
   * the attendee a payment link; the existing `payment.captured` webhook confirms
   * the seat when they pay (resolved via the link's `notes.registrationId`).
   */
  async manualAddAttendee(
    eventId: string,
    dto: {
      ticketTypeId: string;
      name: string;
      email: string;
      mobile?: string;
      gender: string;
      groupSize?: number;
      groupMembers?: Array<{
        name: string;
        email?: string;
        mobile?: string;
        gender?: string;
        customFields?: Record<string, unknown>;
      }>;
      formResponses?: Record<string, unknown>;
      leadCustomFields?: Record<string, unknown>;
      collectPayment?: boolean;
      sendTicketEmail?: boolean;
    },
    /** The curator adding them; their uploads may be referenced by answers. */
    actorId?: string,
  ) {
    const { event, ticketType } = await this.loadEventTicketForManage(
      eventId,
      dto.ticketTypeId,
    );
    this.assertAttendeeActionsOpen(event.endDateTime);

    // Resolve the group size + how many seats this booking consumes.
    let groupSize: number | null = null;
    if (ticketType.kind === 'GROUP') {
      const size = dto.groupSize ?? ticketType.minGroupSize ?? 1;
      if (
        (ticketType.minGroupSize != null && size < ticketType.minGroupSize) ||
        (ticketType.maxGroupSize != null && size > ticketType.maxGroupSize)
      ) {
        throw new BadRequestException(
          `Group size must be between ${ticketType.minGroupSize} and ${ticketType.maxGroupSize}`,
        );
      }
      groupSize = size;
    }
    const seats = groupSize && groupSize > 1 ? groupSize : 1;

    // Capacity (null = unlimited).
    if (
      ticketType.totalQuantity != null &&
      ticketType.soldCount + seats > ticketType.totalQuantity
    ) {
      throw new BadRequestException('Not enough seats left on this ticket type.');
    }

    const userId = await this.findOrCreateUserByEmail(dto.email, dto.name);
    if (await this.hasActiveRegistration(eventId, userId, dto.ticketTypeId)) {
      throw new ConflictException(
        'This person is already registered for this ticket type.',
      );
    }

    // Custom fields split two ways for a group: per-member answers live on each
    // member (the lead being member 1, carrying `leadCustomFields`), while the
    // team-wide (per-group) answers live on the registration (`formResponses`).
    // For an individual ticket there is one person, so their answers are the
    // registration `formResponses` as usual.
    const isGroup = ticketType.kind === 'GROUP';
    const groupMembers = isGroup
      ? [
          {
            name: dto.name,
            email: dto.email,
            mobile: dto.mobile ?? null,
            gender: dto.gender,
            customFields: dto.leadCustomFields ?? {},
          },
          ...(dto.groupMembers ?? []).map((m) => ({
            name: m.name,
            email: m.email ?? null,
            mobile: m.mobile ?? null,
            gender: m.gender ?? null,
            customFields: m.customFields ?? {},
          })),
        ]
      : null;
    // For an individual, gender rides in the registration-level responses (the
    // same `gender` key the attendee detail view reads). For a group it lives on
    // each member above, so the registration bag stays the team-wide answers.
    // Answer policy: types and limits apply, but a curator adding someone may
    // not know every answer, so required questions aren't forced here.
    const checkedResponses = await enforceFormAnswers(this.prisma, {
      eventId,
      ticketTypeId: dto.ticketTypeId,
      isGroup,
      formResponses: dto.formResponses,
      members: groupMembers ?? undefined,
      required: { team: false, members: 'none' },
      uploaderIds: actorId ? [actorId] : [],
    });
    const formResponses = isGroup
      ? checkedResponses
      : { ...checkedResponses, gender: dto.gender };

    const price = Number(ticketType.price);
    const wantsPayment = Boolean(dto.collectPayment) && price > 0;

    // Comping a PAID ticket (adding for free instead of collecting payment) is
    // blocked per-event unless a Platform Admin approved a FreeAttendeeAddRequest
    // for it — so the platform fee is never silently waived. Free/RSVP tickets
    // carry no price and are always comped, so they are never gated.
    if (price > 0 && !wantsPayment && !event.allowFreeAttendeeAdd) {
      throw new ForbiddenException(
        'Adding a paid attendee for free needs platform approval for this event. ' +
          'Collect payment instead, or request the free-add exception.',
      );
    }

    if (!wantsPayment) {
      // Comp: confirmed, zero-amount registration.
      const registrationId = await this.createComplimentaryRegistration(
        eventId,
        userId,
        dto.ticketTypeId,
        { groupSize, groupMembers, formResponses },
      );
      if (dto.sendTicketEmail !== false) {
        void this.confirmations.sendRegistrationConfirmations(registrationId).catch((err) =>
          this.logger.error(`sendRegistrationConfirmations(${registrationId}) failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
      return {
        registrationId,
        paymentStatus: 'PAID' as const,
        message: 'Attendee added and confirmed.',
      };
    }

    // Collect payment: PENDING registration + Razorpay payment link.
    const basePrice =
      ticketType.kind === 'GROUP' && ticketType.groupPricingMode === 'PER_PERSON'
        ? price * (groupSize ?? 1)
        : price;
    const processingFee = this.payments.computeProcessingFee(basePrice);
    const totalAmount = basePrice + processingFee;

    const registration = await this.prisma.eventRegistration.create({
      data: {
        eventId,
        userId,
        ticketTypeId: dto.ticketTypeId,
        quantity: 1,
        groupSize,
        groupMembers:
          (groupMembers as unknown as Prisma.InputJsonValue) ?? undefined,
        totalAmount: new Prisma.Decimal(totalAmount),
        razorpayAmount: new Prisma.Decimal(totalAmount),
        processingFee: new Prisma.Decimal(processingFee),
        paymentStatus: PaymentStatus.PENDING,
        qrCode: generateQRCode(),
        formResponses: formResponses as Prisma.InputJsonValue,
      },
    });

    const link = await this.payments.createPaymentLink({
      amount: totalAmount,
      description: `${event.title} — ${ticketType.name}`,
      customer: {
        name: dto.name,
        email: dto.email,
        contact: dto.mobile,
      },
      referenceId: registration.id,
      notes: { registrationId: registration.id, eventId },
    });

    return {
      registrationId: registration.id,
      paymentStatus: 'PENDING' as const,
      paymentLinkUrl: link.shortUrl,
      amount: totalAmount,
      message: 'Payment link sent to the attendee.',
    };
  }
}
