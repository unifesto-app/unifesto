import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventStatus, EventVisibility, FormFieldType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RegistrationsService } from '../registrations/registrations.service';
import { assertTicketOnSale } from '../registrations/registration-checkout.service';
import { assertNoOutsideLink } from '../events/external-registration';
import { normalizeMobile } from '../auth/identifiers';
import { ApiKeysService, type ResolvedKey } from './api-keys.service';
import type { ApiRegisterDto } from './dto';

/** Registrations one key may create a day (IST), on top of the per-minute limit. */
export const DAILY_REGISTRATIONS = 500;
const IDEMPOTENCY_TTL = 86_400;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Events a key may see and register for: its own space's, live, and open beyond members. */
const listable = (spaceId: string): Prisma.EventWhereInput => ({
  spaceId,
  deletedAt: null,
  status: { in: [EventStatus.PUBLISHED, EventStatus.ONGOING] },
  visibility: { not: EventVisibility.SPACE_ONLY },
});

const EVENT_FIELDS = {
  id: true,
  slug: true,
  title: true,
  type: true,
  startDateTime: true,
  endDateTime: true,
  timezone: true,
  venueName: true,
  city: true,
  externalRegistrationUrl: true,
} satisfies Prisma.EventSelect;

/**
 * K22: what a space's own site can do with an API key. Reads its events and
 * their forms, and registers people the way an organiser's manual add does,
 * with the checks self-registration has (on sale, required answers, 18+).
 */
@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly registrations: RegistrationsService,
    private readonly keys: ApiKeysService,
  ) {}

  /** Upcoming and live events of the key's space, soonest first. */
  async listEvents(spaceId: string) {
    const data = await this.prisma.event.findMany({
      where: { ...listable(spaceId), endDateTime: { gte: new Date() } },
      orderBy: { startDateTime: 'asc' },
      take: 100,
      select: EVENT_FIELDS,
    });
    return { data };
  }

  /** One event with what a form needs: ticket types on sale and the questions. */
  async getEvent(spaceId: string, ref: string) {
    const event = await this.prisma.event.findFirst({
      where: { ...listable(spaceId), ...(UUID.test(ref) ? { id: ref } : { slug: ref }) },
      select: {
        ...EVENT_FIELDS,
        ticketTypes: {
          where: { isActive: true, isVisible: true },
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            kind: true,
            price: true,
            totalQuantity: true,
            soldCount: true,
            saleStartsAt: true,
            saleEndsAt: true,
          },
        },
        formFields: {
          orderBy: { order: 'asc' },
          select: { id: true, ticketTypeId: true, label: true, type: true, options: true, isRequired: true, helpText: true },
        },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const { ticketTypes, formFields, ...rest } = event;
    return {
      ...rest,
      ticketTypes: ticketTypes.map(({ totalQuantity, soldCount, price, ...t }) => ({
        ...t,
        price: Number(price),
        // Group tickets need a team roster: register those on the event page.
        apiRegistration: t.kind !== 'GROUP',
        seatsLeft: totalQuantity == null ? null : Math.max(0, totalQuantity - soldCount),
      })),
      // ticketTypeId null = asked on every ticket. FILE questions can't be answered through the API.
      questions: formFields,
    };
  }

  /**
   * Registers one person. Free tickets confirm at once (ticket by email);
   * paid ones never comp: Razorpay sends the person a payment link and the
   * seat confirms when they pay. A retry with the same Idempotency-Key gets
   * the first answer back instead of a second registration.
   */
  async register(key: ResolvedKey, ref: string, dto: ApiRegisterDto, idempotencyKey: string | undefined) {
    if (!idempotencyKey || idempotencyKey.length > 100) {
      throw new BadRequestException('Send an Idempotency-Key header (up to 100 characters), unique per registration');
    }
    const client = this.redis.getClient();
    if (!client) throw new ServiceUnavailableException('Registrations are paused for a moment. Retry with the same Idempotency-Key.');

    const slot = `apikey-idem-${key.id}-${sha256(idempotencyKey)}`;
    const bodyHash = sha256(JSON.stringify([ref, dto]));
    const claimed = await client.set(slot, JSON.stringify({ pending: true, bodyHash }), 'EX', IDEMPOTENCY_TTL, 'NX');
    if (!claimed) {
      const prior = JSON.parse((await client.get(slot)) ?? '{}') as { pending?: boolean; bodyHash?: string; result?: unknown };
      if (prior.bodyHash && prior.bodyHash !== bodyHash) {
        throw new UnprocessableEntityException('This Idempotency-Key was used for a different registration');
      }
      if (prior.pending || !prior.result) throw new ConflictException('A request with this Idempotency-Key is still running');
      return prior.result;
    }

    try {
      const result = await this.registerOnce(key, ref, dto);
      await client.set(slot, JSON.stringify({ bodyHash, result }), 'EX', IDEMPOTENCY_TTL);
      return result;
    } catch (err) {
      // Nothing was made (or it failed part-way and manual add rolled back): free the key for a retry.
      await client.del(slot).catch(() => undefined);
      throw err;
    }
  }

  private async registerOnce(key: ResolvedKey, ref: string, dto: ApiRegisterDto) {
    const day = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
    if (await this.keys.over(`day-${key.id}-${day}`, DAILY_REGISTRATIONS, 2 * 86_400)) {
      throw new HttpException(`This key has made its ${DAILY_REGISTRATIONS} registrations for today.`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const event = await this.prisma.event.findFirst({
      where: { ...listable(key.spaceId), ...(UUID.test(ref) ? { id: ref } : { slug: ref }) },
      select: { id: true, externalRegistrationUrl: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    assertNoOutsideLink(event);

    const ticket = await this.prisma.eventTicketType.findFirst({
      where: { id: dto.ticketTypeId, eventId: event.id, isActive: true, isVisible: true },
      select: { id: true, kind: true, price: true, saleStartsAt: true, saleEndsAt: true },
    });
    if (!ticket) throw new NotFoundException('Ticket type not found');
    if (ticket.kind === 'GROUP') {
      throw new BadRequestException('Group tickets need a team roster. Send these people to the event page to register.');
    }
    assertTicketOnSale(ticket);

    const fileQuestion = await this.prisma.eventFormField.findFirst({
      where: { eventId: event.id, type: FormFieldType.FILE, isRequired: true, OR: [{ ticketTypeId: null }, { ticketTypeId: ticket.id }] },
      select: { id: true },
    });
    if (fileQuestion) {
      throw new BadRequestException('This ticket asks for a file upload, which the API can’t take. Send these people to the event page.');
    }

    const mobile = dto.phone ? normalizeMobile(dto.phone) : null;
    if (dto.phone && !mobile) throw new BadRequestException('phone must be a mobile number');

    const added = await this.registrations.manualAddAttendee(event.id, {
      ticketTypeId: ticket.id,
      name: dto.name.trim(),
      email: dto.email,
      mobile: mobile ?? undefined,
      gender: dto.gender,
      formResponses: dto.answers,
      // Never a comp: a paid ticket always goes out as a payment link.
      collectPayment: Number(ticket.price) > 0,
      requireAnswers: true,
      utm: { utmSource: key.name, utmMedium: 'api', utmCampaign: dto.campaign },
    });

    return added.paymentStatus === 'PAID'
      ? { registrationId: added.registrationId, status: 'confirmed' as const }
      : {
          registrationId: added.registrationId,
          status: 'payment_pending' as const,
          paymentUrl: (added as { paymentLinkUrl?: string }).paymentLinkUrl ?? null,
          amount: (added as { amount?: number }).amount ?? null,
        };
  }

  /** A registration this key's space owns: status, payment and check-in. */
  async getRegistration(spaceId: string, id: string) {
    if (!UUID.test(id)) throw new NotFoundException('Registration not found');
    const reg = await this.prisma.eventRegistration.findFirst({
      where: { id, event: { spaceId } },
      select: {
        id: true,
        eventId: true,
        ticketTypeId: true,
        status: true,
        paymentStatus: true,
        totalAmount: true,
        checkedInAt: true,
        registeredAt: true,
      },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    return { ...reg, totalAmount: Number(reg.totalAmount) };
  }
}
