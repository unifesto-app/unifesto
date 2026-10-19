import { Cron, CronExpression } from '@nestjs/schedule';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  CertificateAudience,
  CertificateBatchStatus,
  CertificateStatus,
  GroupSeatStatus,
  Prisma,
} from '@prisma/client';
import { CertificateIssuanceQueue } from './certificates.queue';
import { PrismaService } from '../prisma/prisma.service';
import { Action, AuthorizationService } from '../auth/authorization';
import { PlanConfigService } from '../subscription/plan-config.service';
import { PlatformConfigService } from '../subscription/platform-config.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  CertificateRenderService,
  CertificateFieldDef,
} from './certificate-render.service';
import {
  CreateCertificateTemplateDto,
  IssueCertificatesDto,
  UpdateCertificateTemplateDto,
} from './dto';

/** A recipient the resolver has decided should receive a certificate. */
interface Recipient {
  registrationId: string;
  /** Group-member slot; null for an individual. Part of the dedup key. */
  memberIndex: number | null;
  /** The account this certificate is filed under: the member's own; null for a member with no account. */
  userId: string | null;
  name: string;
  email: string | null;
}

/** Form-response keys (or field labels) that hold a person's name/email. */
const NAME_KEYS = ['name', 'full name', 'fullname', 'attendee name'];
const EMAIL_KEYS = ['email', 'e-mail', 'email address'];

/**
 * The issuance-window state for an event, surfaced to the UI so it can show a
 * deadline / disabled state instead of letting a doomed issue call fail. The
 * window length is the admin-configured post-event action window; once it
 * closes, no new certificates can be issued for the event — resends and
 * reissues of already-earned certificates stay open (they serve recipients who
 * already qualified).
 */
export interface IssuanceWindow {
  /** The moment issuance closes (event end + the window), ISO string. */
  closesAt: string;
  /** True while issuing new certificates is still permitted. */
  isOpen: boolean;
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planConfig: PlanConfigService,
    private readonly platformConfig: PlatformConfigService,
    private readonly render: CertificateRenderService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
    private readonly authz: AuthorizationService,
    // forwardRef: the queue's worker calls back into this service (via ModuleRef),
    // so the two form a cycle that forwardRef resolves.
    @Inject(forwardRef(() => CertificateIssuanceQueue))
    private readonly issuanceQueue: CertificateIssuanceQueue,
  ) {}

  /** Public site base URL the verify page lives on. */
  private get webUrl(): string {
    return this.config.get<string>('WEB_URL') || 'https://unifesto.app';
  }

  // =====================================================
  // GUARDS
  // =====================================================

  /**
   * Assert the user organises the event's space, AND that space's plan includes
   * certificates. Returns the event's `spaceId` and `title` for downstream use.
   */
  private async assertCanManage(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        spaceId: true,
        title: true,
        slug: true,
        endDateTime: true,
        space: { select: { name: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // Anyone who may edit the event: its Curator / Co-Curator, a Space Admin of
    // its space (inherited), or a platform admin.
    if (!(await this.authz.can({ id: userId }, Action.EVENT_EDIT, { eventId }))) {
      throw new ForbiddenException(
        'Only an organiser of this event can manage certificates',
      );
    }

    if (!(await this.spaceHasCertificatesPlan(event.spaceId))) {
      throw new ForbiddenException(
        'Certificates are not included in this space’s plan. Upgrade to enable them.',
      );
    }

    return event;
  }

  /** True when the space owner's plan includes the certificate perk. */
  private async spaceHasCertificatesPlan(spaceId: string): Promise<boolean> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { subscription: true },
    });
    const subscription = space?.subscription;
    if (!subscription) return false;
    return this.planConfig.getEffectiveLimits(subscription).hasCertificates;
  }

  /** Describe the issuance window for the UI (deadline + open/closed). The
   *  window length is the admin-configured post-event action window. */
  private describeIssuanceWindow(endDateTime: Date): IssuanceWindow {
    const closesAt = this.platformConfig.postEventDeadline(endDateTime);
    return {
      closesAt: closesAt.toISOString(),
      isOpen: this.platformConfig.isWithinPostEventWindow(endDateTime),
    };
  }

  /**
   * Throw once the issuance window has closed. Called only from `issue()` — the
   * point where an organiser asks to mint NEW certificates. Resends and reissues
   * deliberately skip this check.
   */
  private assertIssuanceWindowOpen(endDateTime: Date) {
    if (!this.platformConfig.isWithinPostEventWindow(endDateTime)) {
      const days = this.platformConfig.getPostEventActionWindowDays();
      throw new ForbiddenException(
        `Certificate issuance closed ${days} day${days === 1 ? '' : 's'} after this event ended. ` +
          'New certificates can no longer be issued.',
      );
    }
  }

  /**
   * The issuance window for an event, for the management UI to render a deadline
   * countdown and disable the "Issue" action once it's closed. Organiser-gated.
   */
  async getIssuanceWindow(
    userId: string,
    eventId: string,
  ): Promise<IssuanceWindow> {
    const event = await this.assertCanManage(eventId, userId);
    return this.describeIssuanceWindow(event.endDateTime);
  }

  // =====================================================
  // TEMPLATES
  // =====================================================

  /**
   * Upload a certificate-template background image and return its hosted URL.
   * The organiser then designs fields against it; the URL is stored on the
   * template. Gated the same as everything else in this event's certificates.
   */
  async uploadBackground(
    userId: string,
    eventId: string,
    file: Express.Multer.File,
  ): Promise<{ url: string }> {
    await this.assertCanManage(eventId, userId);
    const url = await this.storage.uploadFile(
      file,
      'certificate-backgrounds/',
      eventId,
    );
    return { url };
  }

  async createTemplate(
    userId: string,
    eventId: string,
    dto: CreateCertificateTemplateDto,
  ) {
    await this.assertCanManage(eventId, userId);
    return this.prisma.certificateTemplate.create({
      data: {
        eventId,
        name: dto.name,
        backgroundUrl: dto.backgroundUrl,
        canvasWidth: dto.canvasWidth,
        canvasHeight: dto.canvasHeight,
        fields: dto.fields as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });
  }

  async listTemplates(userId: string, eventId: string) {
    await this.assertCanManage(eventId, userId);
    return this.prisma.certificateTemplate.findMany({
      where: { eventId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { certificates: true } } },
    });
  }

  async updateTemplate(
    userId: string,
    templateId: string,
    dto: UpdateCertificateTemplateDto,
  ) {
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: templateId },
      select: { eventId: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanManage(template.eventId, userId);

    return this.prisma.certificateTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.backgroundUrl !== undefined
          ? { backgroundUrl: dto.backgroundUrl }
          : {}),
        ...(dto.canvasWidth !== undefined
          ? { canvasWidth: dto.canvasWidth }
          : {}),
        ...(dto.canvasHeight !== undefined
          ? { canvasHeight: dto.canvasHeight }
          : {}),
        ...(dto.fields !== undefined
          ? { fields: dto.fields as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  /**
   * Delete a template and every certificate issued from it. The certificates go
   * too — their `templateId` FK is RESTRICT, and a certificate's meaning is tied
   * to the template that produced it — so they are removed first in one
   * transaction, then the template. Callers (the designer UI) confirm first when
   * the count is non-zero, since this invalidates those certificates' verify
   * links. Returns how many certificates were removed alongside the template.
   */
  async deleteTemplate(userId: string, templateId: string) {
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: templateId },
      select: { eventId: true, _count: { select: { certificates: true } } },
    });
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanManage(template.eventId, userId);

    // B19: issued certificates are records people hold and verify. A template
    // that has any is retired (hidden, no longer issuable) instead, so every
    // verify link keeps working; an unused one is deleted outright.
    if (template._count.certificates > 0) {
      await this.prisma.certificateTemplate.update({ where: { id: templateId }, data: { deletedAt: new Date() } });
      return { deleted: true, certificatesDeleted: 0, retired: true };
    }
    await this.prisma.certificateTemplate.delete({ where: { id: templateId } });
    return { deleted: true, certificatesDeleted: 0, retired: false };
  }

  /**
   * Templates that belong to OTHER events in the same space, so an organiser can
   * reuse a design they've already built. The current event's own templates are
   * excluded (they're already listed). Each carries its source event's title for
   * the picker. Gated the same as everything else.
   */
  async listSpaceTemplates(userId: string, eventId: string) {
    const event = await this.assertCanManage(eventId, userId);
    return this.prisma.certificateTemplate.findMany({
      where: {
        eventId: { not: eventId },
        event: { spaceId: event.spaceId },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        backgroundUrl: true,
        canvasWidth: true,
        canvasHeight: true,
        fields: true,
        event: { select: { id: true, title: true } },
      },
    });
  }

  /**
   * Copy a template from another event in the same space into this event, as a
   * new template. The design (background, canvas, fields) is duplicated; the
   * copy is independent thereafter, so editing or issuing here never touches the
   * original. The source must live in the same space, which the caller's
   * membership (checked on both events) enforces.
   */
  async importTemplate(
    userId: string,
    eventId: string,
    sourceTemplateId: string,
  ) {
    const target = await this.assertCanManage(eventId, userId);

    const source = await this.prisma.certificateTemplate.findUnique({
      where: { id: sourceTemplateId },
      select: {
        name: true,
        backgroundUrl: true,
        canvasWidth: true,
        canvasHeight: true,
        fields: true,
        event: { select: { spaceId: true } },
      },
    });
    if (!source) throw new NotFoundException('Source template not found');
    if (source.event.spaceId !== target.spaceId) {
      throw new ForbiddenException(
        'That template belongs to a different space',
      );
    }

    return this.prisma.certificateTemplate.create({
      data: {
        eventId,
        name: source.name,
        backgroundUrl: source.backgroundUrl,
        canvasWidth: source.canvasWidth,
        canvasHeight: source.canvasHeight,
        fields: source.fields as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });
  }

  // =====================================================
  // ELIGIBILITY  —  YOUR CONTRIBUTION (see certificates.service message)
  // =====================================================

  /**
   * Resolve WHO should receive certificates for an event, given the chosen
   * audience. This is the heart of "configurable per issuance": one event can
   * issue a participation certificate to everyone who attended and, separately,
   * a winners' certificate to a hand-picked few.
   *
   * Contract:
   *   - Return one {@link Recipient} per person who qualifies.
   *   - Only include registrations belonging to `eventId`.
   *   - `CONFIRMED`  → every confirmed, non-waitlisted attendee (reuse the
   *                    shared {@link COUNTS_AS_ATTENDING} predicate).
   *   - `CHECKED_IN` → the CONFIRMED set, further narrowed to those who
   *                    actually showed up.
   *   - `MANUAL`     → exactly the registrations in `dto.registrationIds`,
   *                    after validating they belong to this event.
   *
   * NOTE: a registration's `checkedInAt` is set on first check-in; the
   * multi-point system also writes `EventCheckinRecord` rows. For v1,
   * `checkedInAt IS NOT NULL` is the simplest "attended" signal.
   */
  private async resolveRecipients(
    eventId: string,
    dto: IssueCertificatesDto,
  ): Promise<Recipient[]> {
    const select = {
      id: true,
      userId: true,
      groupSize: true,
      formResponses: true,
      // GroupSeat rows are the group's roster (S42); CLAIMED seats are the attendees.
      groupSeats: {
        orderBy: { seatIndex: 'asc' as const },
        select: {
          id: true,
          seatIndex: true,
          status: true,
          memberDetails: true,
          claimedByUserId: true,
          claimedBy: {
            select: {
              fullName: true,
              identities: { select: { email: true, isPrimary: true } },
            },
          },
        },
      },
      user: {
        select: {
          fullName: true,
          identities: { select: { email: true, isPrimary: true } },
        },
      },
      // Who in a group was actually scanned (CHECKED_IN audience).
      groupMemberCheckins: { select: { memberIndex: true, groupSeatId: true } },
    } satisfies Prisma.EventRegistrationSelect;

    let where: Prisma.EventRegistrationWhereInput;
    if (dto.audience === CertificateAudience.CONFIRMED) {
      where = { eventId, ...COUNTS_AS_ATTENDING };
    } else if (dto.audience === CertificateAudience.CHECKED_IN) {
      // The CONFIRMED set, narrowed to those who actually showed up.
      // `checkedInAt` is stamped on a registration's first scan.
      where = { eventId, ...COUNTS_AS_ATTENDING, checkedInAt: { not: null } };
    } else {
      // MANUAL — exactly the hand-picked registrations, still confirmed-only:
      // an id outside COUNTS_AS_ATTENDING (cancelled/unpaid/waitlisted) is
      // silently dropped rather than certified.
      where = {
        eventId,
        id: { in: dto.registrationIds ?? [] },
        ...COUNTS_AS_ATTENDING,
      };
    }

    const regs = await this.prisma.eventRegistration.findMany({ where, select });

    // Map form-field id → label so an individual's name can be read out of
    // `formResponses` (which is keyed by field id) by matching NAME_KEYS.
    const fields = await this.prisma.eventFormField.findMany({
      where: { eventId },
      select: { id: true, label: true },
    });
    const labelById = new Map(fields.map((f) => [f.id, f.label]));

    return regs.flatMap((reg) => {
      const people = this.expandRegistration(reg, labelById);
      if (dto.audience !== CertificateAudience.CHECKED_IN || reg.groupMemberCheckins.length === 0) {
        // Not CHECKED_IN, or a group checked in as a whole (no per-member
        // scans): everyone on the booking counts.
        return people;
      }
      // B19: a group scanned member by member certifies only who was scanned,
      // not every claimed seat once one member arrived.
      const scannedSeatIds = new Set(reg.groupMemberCheckins.map((c) => c.groupSeatId).filter(Boolean));
      const scannedIndexes = new Set(reg.groupMemberCheckins.map((c) => c.memberIndex));
      const seatIdByIndex = new Map(reg.groupSeats.map((s) => [s.seatIndex - 1, s.id]));
      return people.filter(
        (p) =>
          p.memberIndex === null ||
          scannedIndexes.has(p.memberIndex) ||
          scannedSeatIds.has(seatIdByIndex.get(p.memberIndex) ?? ''),
      );
    });
  }

  /**
   * Turn one registration into its recipients. A GROUP registration (its team
   * in GroupSeat rows) becomes one recipient per member — each with their own
   * name from the member data — so no teammate is left off. An individual
   * becomes a single recipient whose name is read from the form responses,
   * falling back to the account only when a response has none.
   */
  private expandRegistration(
    reg: {
      id: string;
      userId: string;
      groupSize: number | null;
      groupSeats?: {
        seatIndex: number;
        status: GroupSeatStatus;
        memberDetails: Prisma.JsonValue;
        claimedByUserId?: string | null;
        claimedBy: {
          fullName: string | null;
          identities: { email: string | null; isPrimary: boolean }[];
        } | null;
      }[];
      formResponses: Prisma.JsonValue;
      user: {
        fullName: string | null;
        identities: { email: string | null; isPrimary: boolean }[];
      };
    },
    labelById: Map<string, string>,
  ): Recipient[] {
    const leadEmail =
      reg.user.identities.find((i) => i.isPrimary && i.email)?.email ??
      reg.user.identities.find((i) => i.email)?.email ??
      null;

    // GROUP — one certificate per CLAIMED seat. The
    // memberIndex stays `seatIndex - 1` so it lines up with check-in and any
    // certificate already issued against the legacy 0-based array index.
    const claimedSeats = (reg.groupSeats ?? []).filter(
      (s) => s.status === GroupSeatStatus.CLAIMED,
    );
    if (claimedSeats.length > 0) {
      return claimedSeats.map((seat) => {
        const index = seat.seatIndex - 1;
        const fromDetails = this.memberIdentity(seat.memberDetails);
        const claimerEmail =
          seat.claimedBy?.identities.find((i) => i.isPrimary && i.email)?.email ??
          seat.claimedBy?.identities.find((i) => i.email)?.email ??
          null;
        const isLead = index === 0;
        return {
          registrationId: reg.id,
          memberIndex: index,
          // Filed under the member's own account (B19), so it shows in their
          // app; a typed-in member with no account has none, and the lead's
          // seat stays with the booker.
          userId: seat.claimedByUserId ?? (isLead ? reg.userId : null),
          name:
            fromDetails.name ||
            seat.claimedBy?.fullName ||
            (isLead ? reg.user.fullName : null) ||
            'Attendee',
          email:
            fromDetails.email || claimerEmail || (isLead ? leadEmail : null),
        };
      });
    }

    // INDIVIDUAL — name from the form responses, not the account.
    const responses = (reg.formResponses ?? {}) as Record<string, unknown>;
    const name =
      this.pickFromResponses(responses, labelById, NAME_KEYS) ||
      reg.user.fullName ||
      'Attendee';
    const email =
      this.pickFromResponses(responses, labelById, EMAIL_KEYS) || leadEmail;
    return [
      {
        registrationId: reg.id,
        memberIndex: null,
        userId: reg.userId,
        name,
        email,
      },
    ];
  }

  /** Name/email out of one group-member entry (flattens nested customFields). */
  private memberIdentity(m: unknown): {
    name: string | null;
    email: string | null;
  } {
    const obj = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const flat: Record<string, unknown> = { ...obj };
    const custom = obj.customFields;
    if (custom && typeof custom === 'object') Object.assign(flat, custom);

    const pick = (keys: string[]): string | null => {
      for (const [k, v] of Object.entries(flat)) {
        if (keys.includes(k.toLowerCase()) && v != null && String(v).trim()) {
          return String(v).trim();
        }
      }
      return null;
    };
    return { name: pick(NAME_KEYS), email: pick(EMAIL_KEYS) };
  }

  /**
   * Read a value out of `formResponses` (keyed by field id) by matching either
   * the raw key or the field's LABEL against `keys`.
   */
  private pickFromResponses(
    responses: Record<string, unknown>,
    labelById: Map<string, string>,
    keys: string[],
  ): string | null {
    for (const [fieldId, v] of Object.entries(responses)) {
      if (v == null || !String(v).trim()) continue;
      const label = (labelById.get(fieldId) ?? '').toLowerCase();
      if (keys.includes(fieldId.toLowerCase()) || keys.includes(label)) {
        return String(v).trim();
      }
    }
    return null;
  }

  // =====================================================
  // ISSUANCE
  // =====================================================

  /**
   * Enqueue a certificate-issuance batch. Validates access + the template + the
   * MANUAL contract synchronously (fast 4xx), records a {@link CertificateBatch}
   * row, and hands the heavy render/create/email loop to the concurrency-bounded
   * worker via {@link CertificateIssuanceQueue}. Returns the batch id so the UI
   * can poll {@link getBatch}. When Redis is unavailable the batch is processed
   * inline instead (degraded, unbounded) so the feature still works.
   */
  async issue(userId: string, eventId: string, dto: IssueCertificatesDto) {
    const event = await this.assertCanManage(eventId, userId);

    // New certificates can only be minted inside the post-event window.
    this.assertIssuanceWindowOpen(event.endDateTime);

    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: dto.templateId },
      select: { id: true, eventId: true, deletedAt: true },
    });
    if (!template || template.eventId !== eventId || template.deletedAt) {
      throw new NotFoundException('Template not found for this event');
    }

    if (dto.audience === CertificateAudience.MANUAL && !dto.registrationIds?.length) {
      throw new BadRequestException(
        'registrationIds is required when audience is MANUAL',
      );
    }

    const batch = await this.prisma.certificateBatch.create({
      data: {
        eventId,
        templateId: dto.templateId,
        audience: dto.audience,
        registrationIds:
          dto.audience === CertificateAudience.MANUAL
            ? (dto.registrationIds ?? [])
            : [],
        requestedBy: userId,
      },
      select: { id: true, status: true },
    });

    await this.dispatchBatch(batch.id);

    return { batchId: batch.id, status: batch.status };
  }

  /**
   * Hand a batch to the cert worker. No Redis configured (local dev) = process
   * inline in the background. Redis configured but down = the batch is marked
   * FAILED and the 503 reaches the caller; nothing renders on the request path.
   */
  private async dispatchBatch(batchId: string): Promise<void> {
    let queued: boolean;
    try {
      queued = await this.issuanceQueue.add(batchId);
    } catch (err) {
      await this.prisma.certificateBatch.update({
        where: { id: batchId },
        data: {
          status: CertificateBatchStatus.FAILED,
          error: 'Queue unavailable',
          finishedAt: new Date(),
        },
      });
      throw err;
    }
    if (!queued) {
      void this.processBatch(batchId).catch((error) =>
        this.logger.error(`Inline issuance for batch ${batchId} failed`, error),
      );
    }
  }

  /**
   * Process one queued batch: the actual render → create/reactivate → email
   * loop, run by the worker (or inline when Redis is absent). Idempotent — a
   * BullMQ retry after a crash re-runs safely because already-issued recipients
   * are skipped. Counters are reset at the top so a retry recomputes cleanly.
   * Rethrows on failure so the queue's retry/backoff applies.
   */
  async processBatch(batchId: string): Promise<void> {
    const batch = await this.prisma.certificateBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) {
      this.logger.warn(`processBatch: batch ${batchId} not found`);
      return;
    }

    await this.prisma.certificateBatch.update({
      where: { id: batchId },
      data: {
        status: CertificateBatchStatus.PROCESSING,
        startedAt: new Date(),
        issued: 0,
        reactivated: 0,
        skipped: 0,
        failed: 0,
        error: null,
      },
    });

    try {
      const event = await this.prisma.event.findUnique({
        where: { id: batch.eventId },
        select: {
          id: true,
          spaceId: true,
          title: true,
          slug: true,
          space: { select: { name: true } },
        },
      });
      if (!event) throw new NotFoundException('Event not found');

      const template = await this.prisma.certificateTemplate.findUnique({
        where: { id: batch.templateId },
      });
      if (!template || template.eventId !== batch.eventId) {
        throw new NotFoundException('Template not found for this event');
      }

      const dto: IssueCertificatesDto = {
        templateId: batch.templateId,
        audience: batch.audience,
        registrationIds: batch.registrationIds,
      };
      const userId = batch.requestedBy;

      const recipients = await this.resolveRecipients(batch.eventId, dto);

    // Recipients who already hold an ACTIVE certificate from THIS template are
    // skipped (idempotent re-runs). Active certs from OTHER templates don't
    // block issuance — one event can hand out several different certificates.
    // A hackathon winners batch is per award, so the award is part of the key:
    // one team with two awards gets two certificates from the same template.
    const awardId = batch.awardId ?? null;
    const dedupKey = (registrationId: string | null, memberIndex: number | null) =>
      `${registrationId ?? '-'}:${memberIndex ?? '-'}`;
    const activeForTemplate = await this.prisma.certificate.findMany({
      where: { templateId: template.id, status: CertificateStatus.ISSUED, awardId },
      select: { registrationId: true, memberIndex: true },
    });
    const alreadyIssued = new Set(
      activeForTemplate.map((c) => dedupKey(c.registrationId, c.memberIndex)),
    );
    const hackathon = await this.hackathonValues(batch.eventId, awardId);

    // A recipient's REVOKED certificate (from ANY template on this event) is
    // reactivated IN PLACE rather than duplicated: we re-render it with the
    // template being issued now and re-point it there, but KEEP its number +
    // verification code so its verify link never breaks. Most-recent-first, so a
    // recipient with several revoked rows reactivates their latest one.
    const revokedRows = await this.prisma.certificate.findMany({
      where: { eventId: batch.eventId, status: CertificateStatus.REVOKED, awardId },
      orderBy: [{ revokedAt: 'desc' }, { issuedAt: 'desc' }],
      select: {
        id: true,
        registrationId: true,
        memberIndex: true,
        certificateNumber: true,
        verificationCode: true,
        revokedForCause: true,
      },
    });
    // Someone revoked for cause gets nothing from a re-run, not even a fresh
    // certificate (B19). Reissuing that one certificate is the explicit way back.
    const revokedForCause = new Set(
      revokedRows.filter((c) => c.revokedForCause).map((c) => dedupKey(c.registrationId, c.memberIndex)),
    );
    const reusableRevoked = new Map<
      string,
      { id: string; certificateNumber: string; verificationCode: string }
    >();
    for (const c of revokedRows) {
      const k = dedupKey(c.registrationId, c.memberIndex);
      if (!reusableRevoked.has(k)) {
        reusableRevoked.set(k, {
          id: c.id,
          certificateNumber: c.certificateNumber,
          verificationCode: c.verificationCode,
        });
      }
    }

    const fields = template.fields as unknown as CertificateFieldDef[];
    const issueDate = this.formatDate(new Date());

    const serials = new Map<string, number>();
    let issued = 0;
    let reactivated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      const key = dedupKey(recipient.registrationId, recipient.memberIndex);
      if (alreadyIssued.has(key) || revokedForCause.has(key)) {
        skipped++;
        continue;
      }

      const reuse = reusableRevoked.get(key);

      try {
        // Whichever branch runs, capture the certificate's public identifiers so
        // the recipient can be emailed a link to it below.
        let minted: {
          certificateNumber: string;
          verificationCode: string;
          pdfUrl: string;
        };

        if (reuse) {
          // Reactivate the revoked row in place — reuse its number + code so the
          // verify link persists — re-rendered with the current template. The
          // PDF/PNG overwrite the old files at the same (code-keyed) paths.
          const { pdfUrl, imageUrl } = await this.renderAndUpload(
            template,
            fields,
            event,
            issueDate,
            recipient,
            reuse.certificateNumber,
            reuse.verificationCode,
            hackathon(recipient.registrationId),
          );
          await this.prisma.certificate.update({
            where: { id: reuse.id },
            data: {
              templateId: template.id,
              userId: recipient.userId,
              recipientName: recipient.name,
              recipientEmail: recipient.email,
              audience: dto.audience,
              pdfUrl,
              imageUrl,
              status: CertificateStatus.ISSUED,
              revokedAt: null,
              revokedReason: null,
              revokedForCause: false,
              issuedBy: userId,
              issuedAt: new Date(),
            },
          });
          reusableRevoked.delete(key);
          reactivated++;
          minted = {
            certificateNumber: reuse.certificateNumber,
            verificationCode: reuse.verificationCode,
            pdfUrl,
          };
        } else {
          // Brand-new certificate. The sequential number can collide when two
          // workers/replicas issue the same event at once, so this retries on
          // the unique violation with a freshly recomputed number.
          minted = await this.createWithRetry(
            template,
            fields,
            event,
            issueDate,
            recipient,
            dto,
            userId,
            awardId,
            hackathon(recipient.registrationId),
            serials,
          );
          issued++;
        }

        alreadyIssued.add(key);

        // Deliver the certificate. Fired for both fresh issues and reactivations
        // since each leaves the recipient with a newly-live certificate;
        // recipients skipped above (already issued) are never re-emailed. The
        // email step swallows its own errors, so a mail failure never rolls back
        // an already-persisted certificate.
        await this.deliverCertificate(recipient, event, minted);
      } catch (error) {
        this.logger.error(
          `Failed to issue certificate for ${recipient.name} (${recipient.registrationId})`,
          error,
        );
        errors.push(recipient.registrationId);
      }
    }

      await this.prisma.certificateBatch.update({
        where: { id: batchId },
        data: {
          status: CertificateBatchStatus.COMPLETED,
          finishedAt: new Date(),
          total: recipients.length,
          issued,
          reactivated,
          skipped,
          failed: errors.length,
        },
      });
    } catch (error) {
      await this.prisma.certificateBatch.update({
        where: { id: batchId },
        data: {
          status: CertificateBatchStatus.FAILED,
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error; // let the queue's retry/backoff take over
    }
  }

  /**
   * Organiser: status of one issuance batch, for polling after {@link issue}.
   */
  /**
   * Close batches a crashed worker left hanging (B19), so the issue screen
   * stops showing "processing" forever. BullMQ already retries a stalled job
   * once; anything still PROCESSING after 2 hours, or QUEUED after 6, is dead.
   * Marked FAILED with a way forward: issuing again skips everyone already done.
   * An idempotent updateMany, so every replica can run it.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepStaleBatches(now: Date = new Date()): Promise<number> {
    const hours = (h: number) => new Date(now.getTime() - h * 3_600_000);
    const { count } = await this.prisma.certificateBatch.updateMany({
      where: {
        OR: [
          { status: CertificateBatchStatus.PROCESSING, startedAt: { lt: hours(2) } },
          { status: CertificateBatchStatus.QUEUED, createdAt: { lt: hours(6) } },
        ],
      },
      data: {
        status: CertificateBatchStatus.FAILED,
        finishedAt: now,
        error: 'Stopped before finishing. Issue again to complete it: certificates already issued are skipped.',
      },
    });
    if (count) this.logger.warn(`Closed ${count} stale certificate batch(es)`);
    return count;
  }

  async getBatch(userId: string, batchId: string) {
    const batch = await this.prisma.certificateBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    await this.assertCanManage(batch.eventId, userId);
    return {
      id: batch.id,
      status: batch.status,
      total: batch.total,
      issued: batch.issued,
      reactivated: batch.reactivated,
      skipped: batch.skipped,
      failed: batch.failed,
      error: batch.error,
      createdAt: batch.createdAt,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
    };
  }

  /**
   * Render the PDF + PNG for a recipient and upload both; returns their URLs.
   * Shared by the fresh-issue and reactivation paths so type stays identical.
   */
  private async renderAndUpload(
    template: { backgroundUrl: string; canvasWidth: number; canvasHeight: number },
    fields: CertificateFieldDef[],
    event: { id: string; title: string; space: { name: string } | null },
    issueDate: string,
    // Only the display name is printed; narrowed from Recipient so the reissue
    // path (which renders straight from a stored certificate row) can reuse this.
    recipient: { name: string },
    certificateNumber: string,
    verificationCode: string,
    // Hackathon placeholders ({teamName}, {teamCode}, {awardTitle}); blank elsewhere.
    extra: Record<string, string> = {},
  ): Promise<{ pdfUrl: string; imageUrl: string }> {
    const values: Record<string, string> = {
      teamName: '',
      teamCode: '',
      awardTitle: '',
      ...extra,
      recipientName: recipient.name,
      eventTitle: event.title,
      issueDate,
      certificateNumber,
      spaceName: event.space?.name ?? '',
    };
    const renderInput = {
      backgroundUrl: template.backgroundUrl,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      fields,
      values,
      verifyUrl: `${this.webUrl}/verify/${verificationCode}`,
      verifyCode: verificationCode,
    };
    const { pdf, png } = await this.render.renderAll(renderInput);
    const [pdfUrl, imageUrl] = await Promise.all([
      this.storage.uploadBuffer(
        pdf,
        `certificates/${verificationCode}.pdf`,
        'application/pdf',
      ),
      this.storage.uploadBuffer(
        png,
        `certificates/${verificationCode}.png`,
        'image/png',
      ),
    ]);
    return { pdfUrl, imageUrl };
  }

  /**
   * Email a recipient a link to their certificate and, on a successful send,
   * stamp `emailedAt` on the row (keyed by the unguessable, unique
   * `verificationCode`). A recipient with no email, a certificate not yet
   * rendered, or a send Resend didn't accept leaves `emailedAt` untouched — so a
   * null `emailedAt` is exactly the "still needs delivering" set the resend
   * action targets. Returns whether the mail was sent.
   */
  private async deliverCertificate(
    recipient: { name: string; email: string | null },
    event: { id: string; title: string; space: { name: string } | null },
    cert: {
      certificateNumber: string;
      verificationCode: string;
      pdfUrl: string | null;
    },
  ): Promise<boolean> {
    if (!recipient.email || !cert.pdfUrl) return false;

    const sent = await this.email.sendCertificateIssued({
      email: recipient.email,
      recipientName: recipient.name,
      eventId: event.id,
      eventTitle: event.title,
      issuerName: event.space?.name ?? 'Unifesto',
      certificateNumber: cert.certificateNumber,
      verifyUrl: `${this.webUrl}/verify/${cert.verificationCode}`,
      pdfUrl: cert.pdfUrl,
    });

    if (sent) {
      await this.prisma.certificate.update({
        where: { verificationCode: cert.verificationCode },
        data: { emailedAt: new Date() },
      });
    }
    return sent;
  }

  /**
   * (Re)send certificate emails for an event's issued certificates. By default
   * this targets only those never successfully emailed (`emailedAt IS NULL`) —
   * the "deliver the ones still pending" button — while `includeAlreadySent`
   * re-blasts every issued certificate that has an email on file. Revoked
   * certificates are never emailed. Each successful send stamps `emailedAt`.
   */
  async resendEmails(
    userId: string,
    eventId: string,
    includeAlreadySent = false,
  ) {
    const event = await this.assertCanManage(eventId, userId);

    const certificates = await this.prisma.certificate.findMany({
      where: {
        eventId,
        status: CertificateStatus.ISSUED,
        recipientEmail: { not: null },
        pdfUrl: { not: null },
        ...(includeAlreadySent ? {} : { emailedAt: null }),
      },
      select: {
        recipientName: true,
        recipientEmail: true,
        certificateNumber: true,
        verificationCode: true,
        pdfUrl: true,
      },
    });

    let sent = 0;
    let failed = 0;
    for (const c of certificates) {
      const ok = await this.deliverCertificate(
        { name: c.recipientName, email: c.recipientEmail },
        event,
        {
          certificateNumber: c.certificateNumber,
          verificationCode: c.verificationCode,
          pdfUrl: c.pdfUrl,
        },
      );
      if (ok) sent++;
      else failed++;
    }

    return { total: certificates.length, sent, failed };
  }

  /**
   * Create a brand-new certificate, retrying when the human-readable
   * `certificateNumber` collides. Two things make collisions possible, and the
   * retry must make forward progress against BOTH:
   *   1. `certificate_number` is GLOBALLY unique, but the serial's prefix is
   *      derived from the slug — so two events whose slugs share the same 6-char
   *      prefix draw from one serial space. The starting serial is therefore the
   *      global max for the prefix, not this event's max.
   *   2. Concurrent writers (this event on another replica) can grab the same
   *      serial between our read and insert.
   * On a unique violation we INCREMENT the serial (never re-read the same max,
   * which would loop forever against a pre-existing higher number) and re-render
   * — the number is printed on the certificate. The `verificationCode` is
   * unguessably random, minted once, and never needs a retry.
   */
  private async createWithRetry(
    template: {
      id: string;
      backgroundUrl: string;
      canvasWidth: number;
      canvasHeight: number;
    },
    fields: CertificateFieldDef[],
    event: { id: string; slug: string; title: string; space: { name: string } | null },
    issueDate: string,
    recipient: Recipient,
    dto: IssueCertificatesDto,
    userId: string,
    awardId: string | null = null,
    extra: Record<string, string> = {},
    /** Per-batch next-serial cache, keyed by prefix. */
    serials?: Map<string, number>,
  ): Promise<{ certificateNumber: string; verificationCode: string; pdfUrl: string }> {
    const verificationCode = randomBytes(16).toString('hex');
    const prefix = this.certificatePrefix(event.slug);
    // B19: one MAX query per prefix per batch, then count up locally; a
    // conflict (another batch took the number) re-reads the max.
    let seq = (serials?.get(prefix) ?? (await this.maxSerialForPrefix(prefix))) + 1;
    const MAX_ATTEMPTS = 12;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++, seq++) {
      const certificateNumber = `${prefix}-${String(seq).padStart(4, '0')}`;
      const { pdfUrl, imageUrl } = await this.renderAndUpload(
        template,
        fields,
        event,
        issueDate,
        recipient,
        certificateNumber,
        verificationCode,
        extra,
      );
      try {
        await this.prisma.certificate.create({
          data: {
            eventId: event.id,
            templateId: template.id,
            userId: recipient.userId,
            registrationId: recipient.registrationId,
            memberIndex: recipient.memberIndex,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            audience: dto.audience,
            awardId,
            certificateNumber,
            verificationCode,
            pdfUrl,
            imageUrl,
            issuedBy: userId,
          },
        });
        serials?.set(prefix, seq);
        return { certificateNumber, verificationCode, pdfUrl };
      } catch (error) {
        if (this.isCertNumberConflict(error) && attempt < MAX_ATTEMPTS - 1) {
          // Serial taken: jump past whatever exists now (the loop adds 1).
          seq = Math.max(seq, await this.maxSerialForPrefix(prefix));
          continue;
        }
        throw error;
      }
    }
    // Every attempt collided (all MAX_ATTEMPTS serials taken); surface it rather
    // than returning undefined into the email step.
    throw new Error(
      `Could not allocate a certificate number for ${recipient.registrationId} after ${MAX_ATTEMPTS} attempts`,
    );
  }

  /** True for a Prisma P2002 unique-violation on `certificate_number`. */
  private isCertNumberConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      (error.meta?.target as string[] | undefined)?.includes(
        'certificate_number',
      ) === true
    );
  }

  /** The `UF-<SLUGPREFIX>` stem an event's certificate serials are built on. */
  private certificatePrefix(slug: string): string {
    const p = slug
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 6)
      .toUpperCase();
    return `UF-${p}`;
  }

  /**
   * Highest serial already used for a prefix, scanned GLOBALLY (not per-event).
   * `certificate_number` is globally unique, so the search space for the next
   * serial is every certificate sharing this `UF-<PREFIX>` stem — which can span
   * multiple events whose slugs collided on the 6-char prefix. Scoping this to
   * one event is exactly the bug that made re-issue loop on a taken number.
   */
  private async maxSerialForPrefix(prefix: string): Promise<number> {
    // One aggregate in the database instead of loading every certificate with
    // this prefix into memory (B19: that made a batch O(n²)). The prefix is
    // only [A-Z0-9-], so it is safe inside LIKE.
    const [row] = await this.prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX((substring(certificate_number from '-([0-9]+)$'))::int) AS max
      FROM certificates
      WHERE certificate_number LIKE ${`${prefix}-%`}`;
    return row?.max ?? 0;
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  // =====================================================
  // MANAGEMENT / LISTING
  // =====================================================

  /** Organiser view: certificates issued for an event. */
  async listForEvent(userId: string, eventId: string) {
    await this.assertCanManage(eventId, userId);
    return this.prisma.certificate.findMany({
      where: { eventId },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        recipientName: true,
        recipientEmail: true,
        certificateNumber: true,
        verificationCode: true,
        audience: true,
        status: true,
        pdfUrl: true,
        imageUrl: true,
        issuedAt: true,
        revokedAt: true,
        emailedAt: true,
      },
    });
  }

  async revoke(userId: string, certificateId: string, reason?: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { eventId: true, status: true },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    await this.assertCanManage(cert.eventId, userId);

    if (cert.status === CertificateStatus.REVOKED) {
      throw new BadRequestException('This certificate is already revoked');
    }

    return this.prisma.certificate.update({
      where: { id: certificateId },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason ?? null,
        // One certificate pulled on purpose: re-runs and "Reissue all" leave it.
        revokedForCause: true,
      },
    });
  }

  /**
   * Revoke every currently-issued certificate produced from ONE template, in a
   * single pass. Used by the per-template "Revoke all" action — e.g. after
   * re-issuing from a corrected design. Already-revoked certificates are
   * untouched. Returns how many were revoked.
   */
  async revokeAllForTemplate(
    userId: string,
    templateId: string,
    reason?: string,
  ) {
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: templateId },
      select: { eventId: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    await this.assertCanManage(template.eventId, userId);

    const { count } = await this.prisma.certificate.updateMany({
      where: { templateId, status: CertificateStatus.ISSUED },
      data: {
        status: CertificateStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason ?? null,
        // A bulk revoke is a redesign, not a judgement: re-issuing restores them.
        revokedForCause: false,
      },
    });
    return { revoked: count };
  }

  // =====================================================
  // HACKATHON  (docs/hackathon-mobile-plan.md §9.2)
  // =====================================================

  /**
   * Placeholder values for a hackathon event's certificates: `{teamName}` and
   * `{teamCode}` from the recipient's team (by registration), `{awardTitle}`
   * from the award a winners batch is for. Everything is blank for an event
   * without a hackathon, so templates render the same as before.
   */
  private async hackathonValues(
    eventId: string,
    awardId: string | null,
  ): Promise<(registrationId: string | null) => Record<string, string>> {
    const board = await this.prisma.leaderboard.findUnique({
      where: { eventId },
      select: { id: true, isHackathon: true },
    });
    if (!board?.isHackathon) return () => ({});
    const [teams, award] = await Promise.all([
      this.prisma.leaderboardEntrant.findMany({
        where: { leaderboardId: board.id, registrationId: { not: null } },
        select: { registrationId: true, name: true, teamCode: true },
      }),
      awardId
        ? this.prisma.leaderboardAward.findFirst({ where: { id: awardId, leaderboardId: board.id }, select: { title: true } })
        : Promise.resolve(null),
    ]);
    const byReg = new Map(teams.map((t) => [t.registrationId!, t]));
    return (registrationId) => {
      const team = registrationId ? byReg.get(registrationId) : undefined;
      return { teamName: team?.name ?? '', teamCode: team?.teamCode ?? '', awardTitle: award?.title ?? '' };
    };
  }

  /**
   * Hackathon issuing (the caller has already checked the user may declare
   * winners): queue a MANUAL batch for these registrations, optionally for one
   * award. The space's certificates plan, the issuance window and the template
   * are checked here, exactly as for any other issue.
   */
  async issueForRegistrations(
    requestedBy: string,
    eventId: string,
    templateId: string,
    registrationIds: string[],
    awardId: string | null = null,
  ): Promise<{ batchId: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true, endDateTime: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    if (!(await this.spaceHasCertificatesPlan(event.spaceId))) {
      throw new ForbiddenException('Certificates are not included in this space’s plan. Upgrade to enable them.');
    }
    this.assertIssuanceWindowOpen(event.endDateTime);
    const template = await this.prisma.certificateTemplate.findFirst({
      where: { id: templateId, eventId },
      select: { id: true },
    });
    if (!template) throw new NotFoundException('Template not found for this event');
    if (!registrationIds.length) throw new BadRequestException('Nobody to issue certificates to.');

    const batch = await this.prisma.certificateBatch.create({
      data: {
        eventId,
        templateId,
        audience: CertificateAudience.MANUAL,
        registrationIds,
        awardId,
        requestedBy,
      },
      select: { id: true },
    });
    await this.dispatchBatch(batch.id);
    return { batchId: batch.id };
  }

  /** What the hackathon certificates screen needs: plan, window and the event's templates. */
  async hackathonSetup(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { spaceId: true, endDateTime: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    const [planAllowed, templates, batches] = await Promise.all([
      this.spaceHasCertificatesPlan(event.spaceId),
      this.prisma.certificateTemplate.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, backgroundUrl: true, fields: true },
      }),
      this.prisma.certificateBatch.findMany({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return {
      planAllowed,
      window: this.describeIssuanceWindow(event.endDateTime),
      templates: templates.map((t) => {
        const labels = (Array.isArray(t.fields) ? (t.fields as unknown as CertificateFieldDef[]) : [])
          .filter((f) => f.key === 'custom')
          .map((f) => f.label ?? '');
        return {
          id: t.id,
          name: t.name,
          backgroundUrl: t.backgroundUrl,
          // Whether the design prints the team / award (via custom-text placeholders).
          usesTeam: labels.some((l) => /\{team(Name|Code)\}/.test(l)),
          usesAward: labels.some((l) => l.includes('{awardTitle}')),
        };
      }),
      batches,
    };
  }

  /** One batch's progress, for an event the caller manages. */
  async batchForEvent(eventId: string, batchId: string) {
    const batch = await this.prisma.certificateBatch.findFirst({ where: { id: batchId, eventId } });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  // =====================================================
  // REISSUE  (revoked → live again, from the latest template)
  // =====================================================

  /** Columns a reissue needs off a certificate row (the frozen snapshots). */
  private static readonly REISSUE_SELECT = {
    id: true,
    eventId: true,
    status: true,
    templateId: true,
    recipientName: true,
    recipientEmail: true,
    certificateNumber: true,
    verificationCode: true,
    registrationId: true,
    awardId: true,
  } satisfies Prisma.CertificateSelect;

  /**
   * Reissue ONE revoked certificate: re-render it from its template's CURRENT
   * design and bring it back to ISSUED, then re-email the recipient. Its
   * `certificateNumber` and `verificationCode` are kept, so the public verify
   * link never changes — only the artwork (and issue date) refresh to match the
   * latest template. Only a REVOKED certificate can be reissued; an issued one
   * is rejected (re-emailing an issued cert is what "resend emails" is for).
   */
  async reissue(userId: string, certificateId: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: CertificatesService.REISSUE_SELECT,
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    const event = await this.assertCanManage(cert.eventId, userId);
    if (cert.status !== CertificateStatus.REVOKED) {
      throw new BadRequestException(
        'Only a revoked certificate can be reissued',
      );
    }

    const emailed = await this.reissueOne(cert, event, userId);
    return { reissued: 1, emailed: emailed ? 1 : 0 };
  }

  /**
   * Reissue EVERY revoked certificate for an event in one pass — the "Reissue
   * all" action on the Revoked tab. Each is re-rendered from its own template's
   * current design, brought back to ISSUED (number + verify link preserved), and
   * re-emailed. Processed SEQUENTIALLY on purpose: each render holds a PDF + PNG
   * in native (Skia) memory, so a serial loop keeps peak usage at one
   * certificate — the same bound the issuance worker gives a batch — rather than
   * ballooning RSS. A single certificate's failure is logged and counted, never
   * aborting the rest.
   *
   * The request only checks access and counts; the renders run on the cert
   * worker (S20) and the response says `queued: true` with zero counts. Without
   * Redis configured (local dev) it still runs inline and returns real counts.
   */
  async reissueAllRevoked(userId: string, eventId: string) {
    await this.assertCanManage(eventId, userId);
    const total = await this.prisma.certificate.count({
      where: { eventId, status: CertificateStatus.REVOKED, revokedForCause: false },
    });
    if (total && (await this.issuanceQueue.addReissueRevoked(eventId, userId))) {
      return { total, reissued: 0, emailed: 0, failed: 0, queued: true };
    }
    return this.reissueAllRevokedNow(userId, eventId);
  }

  /** The reissue loop itself; run by the cert worker (or inline, see above). */
  async reissueAllRevokedNow(userId: string, eventId: string) {
    const event = await this.assertCanManage(eventId, userId);

    const revoked = await this.prisma.certificate.findMany({
      // Not the ones revoked for cause (B19): reissue those one by one.
      where: { eventId, status: CertificateStatus.REVOKED, revokedForCause: false },
      orderBy: { revokedAt: 'desc' },
      select: CertificatesService.REISSUE_SELECT,
    });

    let reissued = 0;
    let emailed = 0;
    let failed = 0;
    for (const cert of revoked) {
      try {
        if (await this.reissueOne(cert, event, userId)) emailed++;
        reissued++;
      } catch (error) {
        this.logger.error(`Failed to reissue certificate ${cert.id}`, error);
        failed++;
      }
    }

    return { total: revoked.length, reissued, emailed, failed, queued: false };
  }

  /**
   * Shared core of both reissue paths: re-render a revoked certificate from its
   * template's current fields, flip it back to ISSUED in place (keeping its
   * number + code, clearing the revocation, resetting the delivery stamp), and
   * re-email it. Returns whether the email was sent. The template is re-read here
   * (not passed in) so "latest template" is always honoured per certificate.
   */
  private async reissueOne(
    cert: {
      id: string;
      templateId: string;
      recipientName: string;
      recipientEmail: string | null;
      certificateNumber: string;
      verificationCode: string;
      eventId: string;
      registrationId: string | null;
      awardId: string | null;
    },
    event: { id: string; title: string; space: { name: string } | null },
    userId: string,
  ): Promise<boolean> {
    const template = await this.prisma.certificateTemplate.findUnique({
      where: { id: cert.templateId },
    });
    if (!template) {
      throw new NotFoundException('Template not found for this certificate');
    }

    const fields = template.fields as unknown as CertificateFieldDef[];
    const { pdfUrl, imageUrl } = await this.renderAndUpload(
      template,
      fields,
      event,
      this.formatDate(new Date()),
      { name: cert.recipientName },
      cert.certificateNumber,
      cert.verificationCode,
      (await this.hackathonValues(cert.eventId, cert.awardId))(cert.registrationId),
    );

    await this.prisma.certificate.update({
      where: { id: cert.id },
      data: {
        pdfUrl,
        imageUrl,
        status: CertificateStatus.ISSUED,
        revokedAt: null,
        revokedReason: null,
        revokedForCause: false,
        issuedBy: userId,
        issuedAt: new Date(),
        // Fresh delivery cycle: null until this reissue's email actually sends,
        // so an unemailable recipient still reads as "pending" afterwards.
        emailedAt: null,
      },
    });

    // deliverCertificate stamps emailedAt on success (keyed by verificationCode).
    return this.deliverCertificate(
      { name: cert.recipientName, email: cert.recipientEmail },
      event,
      {
        certificateNumber: cert.certificateNumber,
        verificationCode: cert.verificationCode,
        pdfUrl,
      },
    );
  }

  /** Attendee view: my certificates across all events. */
  async listMine(userId: string) {
    return this.prisma.certificate.findMany({
      where: { userId, status: CertificateStatus.ISSUED },
      orderBy: { issuedAt: 'desc' },
      select: {
        id: true,
        certificateNumber: true,
        verificationCode: true,
        pdfUrl: true,
        imageUrl: true,
        issuedAt: true,
        event: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  // =====================================================
  // PUBLIC VERIFICATION
  // =====================================================

  /**
   * Public, unauthenticated lookup by the unguessable `verificationCode` only.
   * Every certificate carries this code inside its auto-stamped QR (and printed
   * beside it), so a scan or the printed code reaches this endpoint — while the
   * sequential, guessable `certificateNumber` deliberately does NOT resolve, so
   * certificates can't be enumerated. Revoked certificates still resolve (so a
   * shared link never 404s) but report `valid: false`.
   */
  async verify(code: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { verificationCode: code },
      select: {
        certificateNumber: true,
        recipientName: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        imageUrl: true,
        pdfUrl: true,
        event: {
          select: {
            title: true,
            startDateTime: true,
            space: { select: { name: true, slug: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');

    return {
      valid: cert.status === CertificateStatus.ISSUED,
      status: cert.status,
      certificateNumber: cert.certificateNumber,
      recipientName: cert.recipientName,
      eventTitle: cert.event.title,
      eventDate: cert.event.startDateTime,
      issuer: cert.event.space.name,
      issuedAt: cert.issuedAt,
      revokedAt: cert.revokedAt,
      imageUrl: cert.imageUrl,
      pdfUrl: cert.pdfUrl,
    };
  }
}
