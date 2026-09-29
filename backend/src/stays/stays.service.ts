import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EventStatus,
  Prisma,
  StayBookingStatus,
  StayOption,
  StayPaymentMode,
  StayQuestion,
} from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { COUNTS_AS_ATTENDING } from '../common/attendance';
import {
  cfg,
  checkFieldDefinition,
  FILE_DEFAULT_KINDS,
  FILE_DEFAULT_MAX_MB,
  FILE_KIND_MIMES,
  FILE_MAX_MB_CAP,
  formUploadPrefix,
  sanitizeConfig,
  showIfOf,
  type FileAnswer,
  type FileKind,
} from '../registrations/form-answers.util';
import { UPLOAD_EXT, sniffMime } from '../registrations/form-uploads.service';
import {
  CreateStayDto,
  CreateStayOptionDto,
  CreateStayQuestionDto,
  UpdateStayDto,
  UpdateStayOptionDto,
  UpdateStayQuestionDto,
} from './dto';
import {
  bedsLeftByNight,
  dayKey,
  HOLDS_BEDS,
  nightsBetween,
  OPEN_STATUSES,
  parseDay,
} from './stay-rules';

/** Longest bookable window a stay may offer. */
const MAX_WINDOW_NIGHTS = 60;
/** Upload slot name for a guest's photo ID (the "field" part of the key). */
export const stayIdProofSlot = (stayId: string) => `stay-id-${stayId}`;
/**
 * Upload slot for a FILE answer to a stay question: the question id itself,
 * so `checkAnswers` (which expects `{prefix}/{fieldId}/{uploader}/`) accepts it.
 */
export const stayQuestionSlot = (questionId: string) => questionId;

const num = (d: Prisma.Decimal | number | null | undefined) =>
  d == null ? 0 : Number(d);

/**
 * Unifesto Stay — the property side: what the event team sets up (stays,
 * options, questions) and what attendees browse before booking. Bookings
 * themselves live in StayBookingsService.
 *
 * Team routes are guarded by @Can(EVENT_EDIT) at the controller; every method
 * here still scopes lookups to the event in the URL so an id from another
 * event can't be reached through it.
 */
@Injectable()
export class StaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ───────────────────────────── helpers ─────────────────────────────

  private async loadEvent(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        deletedAt: true,
        startDateTime: true,
        endDateTime: true,
        childEvents: { select: { id: true } },
      },
    });
    if (!event || event.deletedAt)
      throw new NotFoundException('Event not found');
    return event;
  }

  async loadStay(eventId: string, stayId: string) {
    const stay = await this.prisma.stay.findUnique({ where: { id: stayId } });
    if (!stay || stay.eventId !== eventId)
      throw new NotFoundException('Stay not found');
    return stay;
  }

  private window(fromS: string, toS: string) {
    const from = parseDay(fromS);
    const to = parseDay(toS);
    if (!from || !to)
      throw new BadRequestException('Use real dates (YYYY-MM-DD).');
    const nights = nightsBetween(from, to);
    if (nights < 1)
      throw new BadRequestException(
        'The last check-out day must be after the first check-in day.',
      );
    if (nights > MAX_WINDOW_NIGHTS) {
      throw new BadRequestException(
        `A stay can be booked for at most ${MAX_WINDOW_NIGHTS} nights.`,
      );
    }
    return { from, to };
  }

  /** Price 0 is always FREE; a priced option is never FREE. */
  private normaliseMode(
    price: number,
    mode: StayPaymentMode | undefined,
  ): StayPaymentMode {
    if (price <= 0) return StayPaymentMode.FREE;
    if (!mode || mode === StayPaymentMode.FREE)
      return StayPaymentMode.PAY_AT_PROPERTY;
    return mode;
  }

  /** Bookings holding beds on an option, for availability maths. */
  async holdings(
    optionIds: string[],
    tx: Prisma.TransactionClient = this.prisma,
    excludeBookingId?: string,
  ) {
    if (!optionIds.length) return [];
    return tx.stayBooking.findMany({
      where: {
        optionId: { in: optionIds },
        status: { in: HOLDS_BEDS },
        ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      },
      select: {
        optionId: true,
        checkInDate: true,
        checkOutDate: true,
        guestCount: true,
      },
    });
  }

  private serializeOption(
    o: StayOption,
    nights?: { date: string; left: number }[],
  ) {
    return {
      id: o.id,
      name: o.name,
      description: o.description,
      gender: o.gender,
      totalBeds: o.totalBeds,
      price: num(o.price),
      pricing: o.pricing,
      paymentMode: o.paymentMode,
      maxGuests: o.maxGuests,
      isActive: o.isActive,
      order: o.order,
      ...(nights
        ? {
            nights,
            bedsLeft: nights.length
              ? Math.min(...nights.map((n) => n.left))
              : 0,
          }
        : {}),
    };
  }

  private serializeQuestion(q: StayQuestion) {
    return {
      id: q.id,
      label: q.label,
      type: q.type,
      options: q.options,
      isRequired: q.isRequired,
      order: q.order,
      helpText: q.helpText,
      config: q.config,
      showIf: q.showIf,
    };
  }

  private serializeStay(
    s: Prisma.StayGetPayload<{ include: { options: true; questions: true } }>,
    nightsByOption?: Map<string, { date: string; left: number }[]>,
  ) {
    return {
      id: s.id,
      eventId: s.eventId,
      name: s.name,
      propertyType: s.propertyType,
      description: s.description,
      coverImageUrl: s.coverImageUrl,
      address: s.address,
      city: s.city,
      mapUrl: s.mapUrl,
      amenities: s.amenities,
      houseRules: s.houseRules,
      contactName: s.contactName,
      contactPhone: s.contactPhone,
      checkInFrom: dayKey(s.checkInFrom),
      checkOutUntil: dayKey(s.checkOutUntil),
      checkInTime: s.checkInTime,
      checkOutTime: s.checkOutTime,
      requireIdProof: s.requireIdProof,
      paymentWindowHours: s.paymentWindowHours,
      isPublished: s.isPublished,
      order: s.order,
      options: [...s.options]
        .sort(
          (a, b) =>
            a.order - b.order || a.createdAt.getTime() - b.createdAt.getTime(),
        )
        .map((o) => this.serializeOption(o, nightsByOption?.get(o.id))),
      questions: [...s.questions]
        .sort((a, b) => a.order - b.order)
        .map((q) => this.serializeQuestion(q)),
    };
  }

  private async nightsFor(
    stays: Prisma.StayGetPayload<{
      include: { options: true; questions: true };
    }>[],
  ) {
    const optionIds = stays.flatMap((s) => s.options.map((o) => o.id));
    const holds = await this.holdings(optionIds);
    const map = new Map<string, { date: string; left: number }[]>();
    for (const s of stays) {
      for (const o of s.options) {
        map.set(
          o.id,
          bedsLeftByNight(
            o.totalBeds,
            holds.filter((h) => h.optionId === o.id),
            s.checkInFrom,
            s.checkOutUntil,
          ),
        );
      }
    }
    return map;
  }

  // ───────────────────────────── team: stays ─────────────────────────────

  /** Every stay on the event (published or not) with live bed counts and booking tallies. */
  async listForTeam(eventId: string) {
    await this.loadEvent(eventId);
    const stays = await this.prisma.stay.findMany({
      where: { eventId },
      include: { options: true, questions: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const nights = await this.nightsFor(stays);
    const tallies = await this.prisma.stayBooking.groupBy({
      by: ['stayId', 'status'],
      where: { eventId },
      _count: { _all: true },
      _sum: { guestCount: true },
    });
    const pendingTotal = tallies
      .filter((t) => t.status === StayBookingStatus.PENDING)
      .reduce((n, t) => n + t._count._all, 0);
    return {
      pendingRequests: pendingTotal,
      stays: stays.map((s) => {
        const mine = tallies.filter((t) => t.stayId === s.id);
        const count = (st: StayBookingStatus[]) =>
          mine
            .filter((t) => st.includes(t.status))
            .reduce((n, t) => n + t._count._all, 0);
        const guests = (st: StayBookingStatus[]) =>
          mine
            .filter((t) => st.includes(t.status))
            .reduce((n, t) => n + (t._sum.guestCount ?? 0), 0);
        return {
          ...this.serializeStay(s, nights),
          counts: {
            pending: count([StayBookingStatus.PENDING]),
            awaitingPayment: count([StayBookingStatus.AWAITING_PAYMENT]),
            confirmed: count([
              StayBookingStatus.CONFIRMED,
              StayBookingStatus.CHECKED_IN,
              StayBookingStatus.CHECKED_OUT,
            ]),
            confirmedGuests: guests([
              StayBookingStatus.CONFIRMED,
              StayBookingStatus.CHECKED_IN,
              StayBookingStatus.CHECKED_OUT,
            ]),
            checkedIn: count([StayBookingStatus.CHECKED_IN]),
          },
        };
      }),
    };
  }

  async getForTeam(eventId: string, stayId: string) {
    await this.loadStay(eventId, stayId);
    const stay = await this.prisma.stay.findUniqueOrThrow({
      where: { id: stayId },
      include: { options: true, questions: true },
    });
    return this.serializeStay(stay, await this.nightsFor([stay]));
  }

  async create(eventId: string, userId: string, dto: CreateStayDto) {
    await this.loadEvent(eventId);
    const { from, to } = this.window(dto.checkInFrom, dto.checkOutUntil);
    const count = await this.prisma.stay.count({ where: { eventId } });
    const stay = await this.prisma.stay.create({
      data: {
        eventId,
        name: dto.name.trim(),
        propertyType: dto.propertyType,
        description: dto.description?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        mapUrl: dto.mapUrl?.trim() || null,
        amenities: (dto.amenities ?? []).map((a) => a.trim()).filter(Boolean),
        houseRules: dto.houseRules?.trim() || null,
        contactName: dto.contactName?.trim() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        checkInFrom: from,
        checkOutUntil: to,
        checkInTime: dto.checkInTime?.trim() || null,
        checkOutTime: dto.checkOutTime?.trim() || null,
        requireIdProof: dto.requireIdProof ?? true,
        paymentWindowHours: dto.paymentWindowHours ?? 48,
        // A new stay has nothing to book yet, so it starts hidden.
        isPublished: false,
        order: dto.order ?? count,
        createdById: userId,
      },
    });
    return this.getForTeam(eventId, stay.id);
  }

  async update(eventId: string, stayId: string, dto: UpdateStayDto) {
    const stay = await this.loadStay(eventId, stayId);
    const data: Prisma.StayUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.propertyType !== undefined) data.propertyType = dto.propertyType;
    const text = (v: string | null | undefined) =>
      v === undefined ? undefined : v?.trim() || null;
    data.description = text(dto.description);
    data.address = text(dto.address);
    data.city = text(dto.city);
    data.mapUrl = text(dto.mapUrl);
    data.houseRules = text(dto.houseRules);
    data.contactName = text(dto.contactName);
    data.contactPhone = text(dto.contactPhone);
    data.checkInTime = text(dto.checkInTime);
    data.checkOutTime = text(dto.checkOutTime);
    if (dto.amenities !== undefined)
      data.amenities = dto.amenities.map((a) => a.trim()).filter(Boolean);
    if (dto.requireIdProof !== undefined)
      data.requireIdProof = dto.requireIdProof;
    if (dto.paymentWindowHours !== undefined)
      data.paymentWindowHours = dto.paymentWindowHours;
    if (dto.order !== undefined) data.order = dto.order;

    if (dto.checkInFrom !== undefined || dto.checkOutUntil !== undefined) {
      const { from, to } = this.window(
        dto.checkInFrom ?? dayKey(stay.checkInFrom),
        dto.checkOutUntil ?? dayKey(stay.checkOutUntil),
      );
      // Don't strand bookings outside the new window.
      const outside = await this.prisma.stayBooking.count({
        where: {
          stayId,
          status: { in: OPEN_STATUSES },
          OR: [{ checkInDate: { lt: from } }, { checkOutDate: { gt: to } }],
        },
      });
      if (outside) {
        throw new ConflictException(
          `${outside} booking${outside === 1 ? ' falls' : 's fall'} outside those dates. Change or cancel ${outside === 1 ? 'it' : 'them'} first.`,
        );
      }
      data.checkInFrom = from;
      data.checkOutUntil = to;
    }

    if (dto.isPublished === true && !stay.isPublished) {
      const active = await this.prisma.stayOption.count({
        where: { stayId, isActive: true },
      });
      if (!active)
        throw new BadRequestException(
          'Add at least one room or bed option before publishing.',
        );
    }
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;

    await this.prisma.stay.update({ where: { id: stayId }, data });
    return this.getForTeam(eventId, stayId);
  }

  async remove(eventId: string, stayId: string) {
    await this.loadStay(eventId, stayId);
    const bookings = await this.prisma.stayBooking.count({ where: { stayId } });
    if (bookings) {
      throw new ConflictException(
        'This stay has bookings, so it can only be unpublished, not deleted.',
      );
    }
    await this.prisma.stay.delete({ where: { id: stayId } });
    return { deleted: true };
  }

  async uploadCover(
    eventId: string,
    stayId: string,
    file: Express.Multer.File | undefined,
  ) {
    await this.loadStay(eventId, stayId);
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose an image to upload.');
    const mime = sniffMime(file.buffer);
    if (!mime || !mime.startsWith('image/'))
      throw new BadRequestException('Upload a JPG, PNG or WebP image.');
    const url = await this.storage.uploadFile(file, 'stays/', stayId);
    await this.prisma.stay.update({
      where: { id: stayId },
      data: { coverImageUrl: url },
    });
    return { coverImageUrl: url };
  }

  // ───────────────────────────── team: options ─────────────────────────────

  async createOption(
    eventId: string,
    stayId: string,
    dto: CreateStayOptionDto,
  ) {
    await this.loadStay(eventId, stayId);
    const price = dto.price ?? 0;
    const count = await this.prisma.stayOption.count({ where: { stayId } });
    await this.prisma.stayOption.create({
      data: {
        stayId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        gender: dto.gender,
        totalBeds: dto.totalBeds,
        price,
        pricing: dto.pricing,
        paymentMode: this.normaliseMode(price, dto.paymentMode),
        maxGuests: dto.maxGuests ?? 1,
        isActive: dto.isActive ?? true,
        order: dto.order ?? count,
      },
    });
    return this.getForTeam(eventId, stayId);
  }

  private async loadOption(stayId: string, optionId: string) {
    const option = await this.prisma.stayOption.findUnique({
      where: { id: optionId },
    });
    if (!option || option.stayId !== stayId)
      throw new NotFoundException('Option not found');
    return option;
  }

  async updateOption(
    eventId: string,
    stayId: string,
    optionId: string,
    dto: UpdateStayOptionDto,
  ) {
    const stay = await this.loadStay(eventId, stayId);
    const option = await this.loadOption(stayId, optionId);
    const price = dto.price ?? num(option.price);

    if (dto.totalBeds !== undefined && dto.totalBeds < option.totalBeds) {
      // Beds can't drop below what's already promised on the busiest night.
      const holds = await this.holdings([optionId]);
      const peak = Math.max(
        0,
        ...bedsLeftByNight(
          option.totalBeds,
          holds,
          stay.checkInFrom,
          stay.checkOutUntil,
        ).map((n) => option.totalBeds - n.left),
      );
      if (dto.totalBeds < peak) {
        throw new ConflictException(
          `${peak} beds are already taken on the busiest night, so keep at least ${peak}.`,
        );
      }
    }

    await this.prisma.stayOption.update({
      where: { id: optionId },
      data: {
        name: dto.name?.trim(),
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        gender: dto.gender,
        totalBeds: dto.totalBeds,
        price: dto.price,
        pricing: dto.pricing,
        paymentMode:
          dto.price !== undefined || dto.paymentMode !== undefined
            ? this.normaliseMode(price, dto.paymentMode ?? option.paymentMode)
            : undefined,
        maxGuests: dto.maxGuests,
        isActive: dto.isActive,
        order: dto.order,
      },
    });
    return this.getForTeam(eventId, stayId);
  }

  async removeOption(eventId: string, stayId: string, optionId: string) {
    await this.loadStay(eventId, stayId);
    await this.loadOption(stayId, optionId);
    const bookings = await this.prisma.stayBooking.count({
      where: { optionId },
    });
    if (bookings)
      throw new ConflictException(
        'People have booked this option. Switch it off instead of deleting it.',
      );
    await this.prisma.stayOption.delete({ where: { id: optionId } });
    return this.getForTeam(eventId, stayId);
  }

  // ───────────────────────────── team: questions ─────────────────────────────

  private async assertValidQuestion(
    stayId: string,
    def: Parameters<typeof checkFieldDefinition>[0],
  ) {
    const siblings = await this.prisma.stayQuestion.findMany({
      where: { stayId },
    });
    const err = checkFieldDefinition(
      def,
      siblings
        .filter((s) => s.id !== def.id)
        .map((s) => ({ ...s, perGroup: false })),
    );
    if (err)
      throw new BadRequestException(
        err.replace('on this ticket', 'on this stay'),
      );
  }

  async createQuestion(
    eventId: string,
    stayId: string,
    dto: CreateStayQuestionDto,
  ) {
    await this.loadStay(eventId, stayId);
    const options = (dto.options || []).map((o) => o.trim()).filter(Boolean);
    const config = sanitizeConfig(dto.type, dto.config);
    const order =
      dto.order ??
      (await this.prisma.stayQuestion.count({ where: { stayId } }));
    await this.assertValidQuestion(stayId, {
      type: dto.type,
      options,
      perGroup: false,
      order,
      config,
      showIf: dto.showIf ?? null,
    });
    const showIf = showIfOf({ showIf: dto.showIf });
    await this.prisma.stayQuestion.create({
      data: {
        stayId,
        label: dto.label.trim(),
        type: dto.type,
        options,
        isRequired: dto.type === 'SECTION' ? false : (dto.isRequired ?? false),
        order,
        helpText: dto.helpText?.trim() || null,
        config: (config as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
        showIf: showIf
          ? { fieldId: showIf.fieldId, anyOf: showIf.anyOf }
          : Prisma.DbNull,
      },
    });
    return this.getForTeam(eventId, stayId);
  }

  async updateQuestion(
    eventId: string,
    stayId: string,
    questionId: string,
    dto: UpdateStayQuestionDto,
  ) {
    await this.loadStay(eventId, stayId);
    const q = await this.prisma.stayQuestion.findUnique({
      where: { id: questionId },
    });
    if (!q || q.stayId !== stayId)
      throw new NotFoundException('Question not found');
    const type = dto.type ?? q.type;
    const options = dto.options
      ? dto.options.map((o) => o.trim()).filter(Boolean)
      : q.options;
    const config = sanitizeConfig(
      type,
      dto.config === undefined ? q.config : dto.config,
    );
    const showIfRaw = dto.showIf === undefined ? q.showIf : dto.showIf;
    await this.assertValidQuestion(stayId, {
      id: q.id,
      type,
      options,
      perGroup: false,
      order: dto.order ?? q.order,
      config,
      showIf: showIfRaw ?? null,
    });
    const showIf = showIfOf({ showIf: showIfRaw });
    await this.prisma.stayQuestion.update({
      where: { id: questionId },
      data: {
        label: dto.label?.trim(),
        type,
        options,
        isRequired: type === 'SECTION' ? false : dto.isRequired,
        order: dto.order,
        helpText:
          dto.helpText === undefined ? undefined : dto.helpText?.trim() || null,
        config: (config as Prisma.InputJsonObject | null) ?? Prisma.DbNull,
        showIf: showIf
          ? { fieldId: showIf.fieldId, anyOf: showIf.anyOf }
          : Prisma.DbNull,
      },
    });
    return this.getForTeam(eventId, stayId);
  }

  async removeQuestion(eventId: string, stayId: string, questionId: string) {
    await this.loadStay(eventId, stayId);
    const q = await this.prisma.stayQuestion.findUnique({
      where: { id: questionId },
    });
    if (!q || q.stayId !== stayId)
      throw new NotFoundException('Question not found');
    await this.prisma.stayQuestion.delete({ where: { id: questionId } });
    return this.getForTeam(eventId, stayId);
  }

  // ───────────────────────────── attendee ─────────────────────────────

  /**
   * The event's registration that lets this user book a stay: an attending
   * registration on the event itself or, for a big event, on one of its
   * sub-events. Null when they aren't registered.
   */
  async eligibleRegistration(
    userId: string,
    event: { id: string; childEvents: { id: string }[] },
  ) {
    return this.prisma.eventRegistration.findFirst({
      where: {
        userId,
        eventId: { in: [event.id, ...event.childEvents.map((c) => c.id)] },
        ...COUNTS_AS_ATTENDING,
      },
      select: { id: true },
      orderBy: { registeredAt: 'asc' },
    });
  }

  /** Published stays for an attendee, with nightly availability and their own booking. */
  async listForAttendee(eventId: string, userId: string) {
    const event = await this.loadEvent(eventId);
    const stays = await this.prisma.stay.findMany({
      where: { eventId, isPublished: true },
      include: { options: { where: { isActive: true } }, questions: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    const nights = await this.nightsFor(stays);
    const [registration, myBooking] = await Promise.all([
      this.eligibleRegistration(userId, event),
      this.prisma.stayBooking.findFirst({
        where: { eventId, userId, status: { in: OPEN_STATUSES } },
        select: { id: true, status: true, stayId: true, optionId: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      event: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
      },
      canBook:
        !!registration && event.status === EventStatus.PUBLISHED && !myBooking,
      registered: !!registration,
      myBooking,
      stays: stays
        .filter((s) => s.options.length > 0)
        .map((s) => this.serializeStay(s, nights)),
    };
  }

  /**
   * Store a guest's photo ID (no questionId) or a FILE answer to a stay
   * question, privately, under the same key layout as registration uploads so
   * `/events/:id/form-uploads/url` serves them and the retention purge clears them.
   */
  async upload(
    userId: string,
    stayId: string,
    questionId: string | undefined,
    file: Express.Multer.File | undefined,
  ): Promise<FileAnswer> {
    if (!file?.buffer?.length)
      throw new BadRequestException('Choose a file to upload.');
    const stay = await this.prisma.stay.findUnique({
      where: { id: stayId },
      select: { id: true, eventId: true, isPublished: true },
    });
    if (!stay || !stay.isPublished)
      throw new NotFoundException('Stay not found');

    let kinds: FileKind[] = ['image', 'pdf'];
    let maxMb = FILE_DEFAULT_MAX_MB;
    let slot = stayIdProofSlot(stayId);
    if (questionId) {
      const q = await this.prisma.stayQuestion.findUnique({
        where: { id: questionId },
      });
      if (!q || q.stayId !== stayId)
        throw new NotFoundException('Question not found');
      if (q.type !== 'FILE')
        throw new BadRequestException('This question does not take a file.');
      const c = cfg(q);
      kinds = c.fileKinds?.length ? c.fileKinds : FILE_DEFAULT_KINDS;
      maxMb = Math.min(c.maxSizeMb ?? FILE_DEFAULT_MAX_MB, FILE_MAX_MB_CAP);
      slot = stayQuestionSlot(questionId);
    }

    if (file.size > maxMb * 1024 * 1024)
      throw new BadRequestException(`Files can be up to ${maxMb} MB.`);
    const mime = sniffMime(file.buffer);
    const allowed = kinds.flatMap((k) => FILE_KIND_MIMES[k] ?? []);
    if (!mime || !allowed.includes(mime)) {
      const names = kinds
        .map((k) => ({ pdf: 'PDF', image: 'image', doc: 'Word document' })[k])
        .join(', ');
      throw new BadRequestException(`Upload a ${names}.`);
    }

    const key = `${formUploadPrefix(stay.eventId, slot, userId)}${crypto.randomUUID()}.${UPLOAD_EXT[mime]}`;
    await this.storage.uploadPrivate(file.buffer, key, mime);
    return {
      key,
      name: (file.originalname || `file.${UPLOAD_EXT[mime]}`).slice(0, 200),
      size: file.size,
      mime,
    };
  }

  /** Throws unless the viewer may still act on this event's stays. */
  assertEventOpen(event: { status: EventStatus; endDateTime: Date }) {
    if (event.status !== EventStatus.PUBLISHED)
      throw new ForbiddenException('This event is not taking stay bookings.');
    if (event.endDateTime < new Date())
      throw new ForbiddenException('This event has ended.');
  }
}
