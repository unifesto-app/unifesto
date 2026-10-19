import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import slugify from 'slugify';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { expandRRule, parseRRule } from './rrule.util';

/**
 * The recurrence engine (event-calendar P2). Materializes a recurring series
 * into concrete occurrence Event rows and keeps them reconciled over a rolling
 * window. Deliberately isolated from the money/registration code: an occurrence
 * is an ordinary Event, so registration/tickets/check-in/payouts keep working
 * unchanged (Model A). The complexity lives here, in generation + edit-scope.
 *
 * Locked decisions honoured:
 *  - D2: rolling window = the sooner of the rule's own end or ~12 months out,
 *    extended by a daily reconcile cron.
 *  - D3: v1 edit scopes are "whole series" (regenerate/propagate to future
 *    unmodified rows) and "this occurrence" (detach one row).
 *  - D4: never delete/move an occurrence that has registrations (of any
 *    status, A29); a detached or registered occurrence is frozen and edited
 *    individually.
 *  - D5: ticket types are authored on the parent and copied to each occurrence.
 */
@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);
  /** How far ahead we ever materialize ("weekly forever" can't be infinite). */
  private static readonly HORIZON_MONTHS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Daily: extend every active series' rolling window so "weekly forever" keeps
   * ~12 months of occurrences materialized ahead. 3 AM IST is off-peak. Every
   * replica fires this cron, so one wins a Redis lock per day and runs it; the
   * (seriesParentId, startDateTime) unique index catches any overlap left
   * (Redis down = fail open, or a create racing the cron).
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailyReconcile(): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const ran = await this.redis.runExclusive(
      `cron:recurrenceReconcile:${day}`,
      6 * 60 * 60,
      async () => {
        this.logger.log('recurrence: daily series reconcile starting');
        await this.reconcileAllSeries();
        this.logger.log('recurrence: daily series reconcile done');
      },
    );
    if (!ran)
      this.logger.log('recurrence: reconcile skipped (another replica ran it)');
  }

  /** Far edge of the rolling window from a given "now". */
  private horizonFrom(now: Date): Date {
    const to = new Date(now);
    to.setUTCMonth(to.getUTCMonth() + RecurrenceService.HORIZON_MONTHS);
    return to;
  }

  /** Build a unique, human-readable slug for one occurrence. */
  private occurrenceSlug(title: string, start: Date): string {
    const base = slugify(title, { lower: true, strict: true });
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${start.getUTCFullYear()}${p(start.getUTCMonth() + 1)}${p(start.getUTCDate())}`;
    const rand = Math.random().toString(36).substring(2, 6);
    return `${base}-${stamp}-${rand}`;
  }

  /**
   * The set of parent fields an occurrence inherits. Excludes identity (id/slug),
   * schedule (set per occurrence), recurrence flags, the festival-hierarchy
   * pointer (a series occurrence is not a sub-event), and live counters.
   */
  private occurrenceDataFromParent(
    parent: Prisma.EventGetPayload<object>,
    start: Date,
    end: Date,
  ): Prisma.EventCreateInput {
    return {
      title: parent.title,
      slug: this.occurrenceSlug(parent.title, start),
      description: parent.description,
      coverImageUrl: parent.coverImageUrl,
      type: parent.type,
      registrationType: parent.registrationType,
      startDateTime: start,
      endDateTime: end,
      timezone: parent.timezone,
      venueName: parent.venueName,
      venueAddress: parent.venueAddress,
      city: parent.city,
      state: parent.state,
      country: parent.country,
      latitude: parent.latitude,
      longitude: parent.longitude,
      onlineUrl: parent.onlineUrl,
      onlinePlatform: parent.onlinePlatform,
      capacity: parent.capacity,
      waitlistEnabled: parent.waitlistEnabled,
      isFree: parent.isFree,
      tags: parent.tags,
      category: parent.category,
      categories: parent.categories,
      visibility: parent.visibility,
      // Occurrences of a published series are themselves published, so they
      // list and register immediately; a draft series yields draft occurrences.
      status: parent.status,
      // An occurrence is NOT recurring itself and NOT a festival sub-event.
      isRecurring: false,
      space: { connect: { id: parent.spaceId } },
      creator: { connect: { id: parent.createdBy } },
      seriesParent: { connect: { id: parent.id } },
      ...(parent.payoutBankAccountId
        ? { payoutBankAccount: { connect: { id: parent.payoutBankAccountId } } }
        : {}),
    };
  }

  /**
   * Idempotently materialize a series up to the rolling-window horizon. Creates
   * only the occurrences that don't yet exist (deduped by start instant), copies
   * the parent's ticket-type template onto each, and advances the parent's
   * `seriesGeneratedUntil`. Safe to call repeatedly (create + cron both use it).
   *
   * Returns the number of occurrences created.
   */
  async generateOccurrences(
    parentId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
    });
    // Only materialize a PUBLISHED series. A draft parent is still being authored
    // (its ticket template isn't final), so occurrences are generated at publish
    // time — that way each occurrence inherits the finished ticket types.
    if (
      !parent ||
      !parent.isRecurring ||
      !parent.recurringRule ||
      parent.status !== 'PUBLISHED'
    ) {
      return 0;
    }

    let rule;
    try {
      rule = parseRRule(parent.recurringRule);
    } catch (err) {
      this.logger.error(
        `Series ${parentId} has an invalid RRULE, skipping: ${err instanceof Error ? err.message : err}`,
      );
      return 0;
    }

    const durationMs =
      parent.endDateTime.getTime() - parent.startDateTime.getTime();
    const to = this.horizonFrom(now);

    // Generate from the true DTSTART (so COUNT/UNTIL are honoured), but only
    // create occurrences from `now` forward — we never materialize past events.
    const starts = expandRRule(parent.startDateTime, rule, { from: now, to });

    // Dedupe against what already exists for this series.
    const existing = await this.prisma.event.findMany({
      where: { seriesParentId: parentId },
      select: { startDateTime: true },
    });
    const seen = new Set(existing.map((e) => e.startDateTime.getTime()));

    const toCreate = starts.filter((s) => !seen.has(s.getTime()));

    const createdIds: string[] = [];
    for (const start of toCreate) {
      const end = new Date(start.getTime() + durationMs);
      try {
        const occ = await this.prisma.event.create({
          data: this.occurrenceDataFromParent(parent, start, end),
          select: { id: true },
        });
        createdIds.push(occ.id);
      } catch (err) {
        // Another runner created this slot between our read and the insert;
        // the unique index rejected our copy. Not an error.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
    }
    const created = createdIds.length;
    // Tickets, questions, content and team (B17).
    if (created) await this.syncSetup(parentId, { now, onlyIds: createdIds });

    await this.prisma.event.update({
      where: { id: parentId },
      data: { seriesGeneratedUntil: to },
    });

    if (created) {
      this.logger.log(
        `Series ${parentId}: materialized ${created} new occurrence(s)`,
      );
    }
    return created;
  }

  /**
   * Mirror the parent's setup into its future occurrences (B17): ticket types
   * (updated in place through `sourceTicketTypeId`, so ids stay stable), ticket
   * blocks, questions, agenda, speakers, prizes, contacts, FAQs and the event
   * team. Only touches occurrences that haven't started, aren't detached and
   * have no registrations at all, so nothing anyone booked or answered changes.
   * Dates on the parent (agenda slots, ticket sale windows) shift by each
   * occurrence's offset from the parent's start.
   *
   * A fixed number of queries per table whatever the number of occurrences.
   * `onlyIds` limits it to freshly created occurrences.
   */
  async syncSetup(parentId: string, opts: { now?: Date; onlyIds?: string[] } = {}): Promise<number> {
    const now = opts.now ?? new Date();
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      include: {
        ticketTypes: { include: { blocks: true } },
        formFields: true,
        agenda: true,
        speakers: true,
        prizes: true,
        contacts: true,
        faqs: true,
        userRoles: true,
      },
    });
    if (!parent?.isRecurring) return 0;

    const occs = await this.prisma.event.findMany({
      where: {
        seriesParentId: parentId,
        seriesDetached: false,
        startDateTime: { gt: now },
        registrations: { none: {} },
        ...(opts.onlyIds ? { id: { in: opts.onlyIds } } : {}),
      },
      select: { id: true, startDateTime: true },
    });
    if (!occs.length) return 0;
    const occIds = occs.map((o) => o.id);
    const shift = (d: Date | null, occStart: Date) =>
      d ? new Date(d.getTime() + occStart.getTime() - parent.startDateTime.getTime()) : null;
    const ticketFields = (t: (typeof parent.ticketTypes)[number], occStart: Date) => ({
      name: t.name,
      description: t.description,
      price: t.price,
      currency: t.currency,
      totalQuantity: t.totalQuantity,
      kind: t.kind,
      groupPricingMode: t.groupPricingMode,
      minGroupSize: t.minGroupSize,
      maxGroupSize: t.maxGroupSize,
      saleStartsAt: shift(t.saleStartsAt, occStart),
      saleEndsAt: shift(t.saleEndsAt, occStart),
      perUserLimit: t.perUserLimit,
      waitlistEnabled: t.waitlistEnabled,
      waitlistOfferTtlHours: t.waitlistOfferTtlHours,
      isVisible: t.isVisible,
      isActive: t.isActive,
      order: t.order,
      whatsappGroupUrl: t.whatsappGroupUrl,
    });

    await this.prisma.$transaction(
      async (tx) => {
        // Ticket types: drop the ones the parent no longer has, update the
        // rest in place, add the new ones.
        const parentTicketIds = parent.ticketTypes.map((t) => t.id);
        await tx.eventTicketType.deleteMany({
          where: {
            eventId: { in: occIds },
            OR: [{ sourceTicketTypeId: null }, { sourceTicketTypeId: { notIn: parentTicketIds } }],
          },
        });
        const existing = await tx.eventTicketType.findMany({
          where: { eventId: { in: occIds } },
          select: { id: true, eventId: true, sourceTicketTypeId: true },
        });
        const occTicket = new Map(existing.map((t) => [`${t.eventId}:${t.sourceTicketTypeId}`, t.id]));
        const fresh: Prisma.EventTicketTypeCreateManyInput[] = [];
        // Without a sale window every occurrence gets the same values: one
        // updateMany per ticket instead of one update per occurrence.
        const sameEverywhere = new Set(parent.ticketTypes.filter((t) => !t.saleStartsAt && !t.saleEndsAt).map((t) => t.id));
        for (const t of parent.ticketTypes.filter((t) => sameEverywhere.has(t.id))) {
          await tx.eventTicketType.updateMany({
            where: { eventId: { in: occIds }, sourceTicketTypeId: t.id },
            data: ticketFields(t, parent.startDateTime),
          });
        }
        for (const occ of occs) {
          for (const t of parent.ticketTypes) {
            const id = occTicket.get(`${occ.id}:${t.id}`);
            if (id) {
              if (!sameEverywhere.has(t.id)) {
                await tx.eventTicketType.update({ where: { id }, data: ticketFields(t, occ.startDateTime) });
              }
            } else {
              const newId = randomUUID();
              occTicket.set(`${occ.id}:${t.id}`, newId);
              fresh.push({ id: newId, eventId: occ.id, sourceTicketTypeId: t.id, soldCount: 0, ...ticketFields(t, occ.startDateTime) });
            }
          }
        }
        if (fresh.length) await tx.eventTicketType.createMany({ data: fresh });
        const ticketFor = (occId: string, parentTicketId: string | null) =>
          parentTicketId ? (occTicket.get(`${occId}:${parentTicketId}`) ?? null) : null;

        // Ticket blocks, rebuilt between each occurrence's own tickets.
        await tx.ticketTypeBlock.deleteMany({ where: { blocker: { eventId: { in: occIds } } } });
        const blocks = occs.flatMap((occ) =>
          parent.ticketTypes.flatMap((t) =>
            t.blocks.map((b) => ({ blockerId: ticketFor(occ.id, t.id)!, blockedId: ticketFor(occ.id, b.blockedId)! })),
          ),
        );
        if (blocks.length) await tx.ticketTypeBlock.createMany({ data: blocks.filter((b) => b.blockerId && b.blockedId), skipDuplicates: true });

        // Questions, with ticket-scoped ones and show-if rules pointed at the
        // occurrence's own tickets and questions.
        await tx.eventFormField.deleteMany({ where: { eventId: { in: occIds } } });
        const fields = occs.flatMap((occ) => {
          const fieldId = new Map(parent.formFields.map((f) => [f.id, randomUUID()]));
          return parent.formFields.map((f) => {
            const showIf = f.showIf as { fieldId?: string; anyOf?: string[] } | null;
            return {
              id: fieldId.get(f.id)!,
              eventId: occ.id,
              ticketTypeId: ticketFor(occ.id, f.ticketTypeId),
              label: f.label,
              type: f.type,
              options: f.options,
              isRequired: f.isRequired,
              order: f.order,
              perGroup: f.perGroup,
              helpText: f.helpText,
              config: f.config ?? Prisma.JsonNull,
              showIf: showIf?.fieldId
                ? { ...showIf, fieldId: fieldId.get(showIf.fieldId) ?? showIf.fieldId }
                : Prisma.JsonNull,
            };
          });
        });
        if (fields.length) await tx.eventFormField.createMany({ data: fields });

        // Content: replaced wholesale (nothing else points at these rows).
        const each = <T>(rows: T[], map: (row: T, occ: (typeof occs)[number]) => object) =>
          occs.flatMap((occ) => rows.map((r) => ({ ...map(r, occ), eventId: occ.id })));
        await tx.eventAgenda.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.eventAgenda.createMany({
          data: each(parent.agenda, (a, occ) => ({
            title: a.title,
            description: a.description,
            startTime: shift(a.startTime, occ.startDateTime)!,
            endTime: shift(a.endTime, occ.startDateTime)!,
            speakerName: a.speakerName,
            order: a.order,
          })) as Prisma.EventAgendaCreateManyInput[],
        });
        await tx.eventSpeaker.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.eventSpeaker.createMany({
          data: each(parent.speakers, ({ id: _id, eventId: _e, createdAt: _c, ...rest }) => rest) as Prisma.EventSpeakerCreateManyInput[],
        });
        await tx.eventPrize.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.eventPrize.createMany({
          data: each(parent.prizes, ({ id: _id, eventId: _e, createdAt: _c, ...rest }) => rest) as Prisma.EventPrizeCreateManyInput[],
        });
        await tx.eventContact.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.eventContact.createMany({
          data: each(parent.contacts, ({ id: _id, eventId: _e, createdAt: _c, ...rest }) => rest) as Prisma.EventContactCreateManyInput[],
        });
        await tx.eventFaq.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.eventFaq.createMany({
          data: each(parent.faqs, ({ id: _id, eventId: _e, createdAt: _c, ...rest }) => rest) as Prisma.EventFaqCreateManyInput[],
        });

        // Event team: the occurrence's team is the series team, so removing
        // someone from the series also removes them from what's coming.
        await tx.userRole.deleteMany({ where: { eventId: { in: occIds } } });
        await tx.userRole.createMany({
          data: each(parent.userRoles, (r) => ({
            userId: r.userId,
            roleId: r.roleId,
            spaceId: r.spaceId,
            assignedBy: r.assignedBy,
          })) as Prisma.UserRoleCreateManyInput[],
          skipDuplicates: true,
        });
      },
      { timeout: 30_000 },
    );
    return occs.length;
  }

  /**
   * After a setup edit (tickets, questions, content, team) on an event: a
   * series parent pushes it to its future occurrences; an occurrence edited on
   * its own leaves the series, the same as editing its details does.
   */
  async afterSetupChange(eventId: string): Promise<void> {
    const e = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { isRecurring: true, seriesParentId: true, seriesDetached: true },
    });
    if (e?.isRecurring) await this.syncSetup(eventId);
    else if (e?.seriesParentId && !e.seriesDetached) await this.detachOccurrence(eventId);
  }

  /**
   * Extend every active series' rolling window. Called by the daily cron. Only
   * touches series whose horizon is within a month of running out, so a steady
   * state is cheap. Each series is independent — one bad RRULE can't stall the rest.
   */
  async reconcileAllSeries(now: Date = new Date()): Promise<void> {
    const refillBefore = new Date(now);
    refillBefore.setUTCMonth(
      refillBefore.getUTCMonth() + RecurrenceService.HORIZON_MONTHS - 1,
    );

    const parents = await this.prisma.event.findMany({
      where: {
        isRecurring: true,
        deletedAt: null,
        // Only published series have occurrences (see generateOccurrences).
        status: 'PUBLISHED',
        OR: [
          { seriesGeneratedUntil: null },
          { seriesGeneratedUntil: { lt: refillBefore } },
        ],
      },
      select: { id: true },
    });

    for (const p of parents) {
      try {
        await this.generateOccurrences(p.id, now);
      } catch (err) {
        this.logger.error(
          `Series reconcile failed for ${p.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    // Re-mirror setup into every live series, in case an edit's sync failed.
    const live = await this.prisma.event.findMany({
      where: { isRecurring: true, deletedAt: null, status: 'PUBLISHED' },
      select: { id: true },
    });
    for (const p of live) {
      try {
        await this.syncSetup(p.id, { now });
      } catch (err) {
        this.logger.error(`Series setup sync failed for ${p.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  /**
   * "Whole series" edit (D3): propagate a field patch from the parent to every
   * FUTURE occurrence that is safe to touch — not started, not detached, and
   * with no registrations (registered occurrences are frozen, D4). Past
   * occurrences are never modified.
   */
  async propagateToFutureOccurrences(
    parentId: string,
    patch: Prisma.EventUpdateManyMutationInput,
    now: Date = new Date(),
  ): Promise<number> {
    const result = await this.prisma.event.updateMany({
      where: {
        seriesParentId: parentId,
        seriesDetached: false,
        registeredCount: 0,
        startDateTime: { gt: now },
      },
      data: patch,
    });
    return result.count;
  }

  /**
   * Regenerate after the parent's schedule changed: drop future occurrences
   * nothing points at (not started, not detached, no registration row of any
   * status, no stay booking, refund or payout), then re-materialize from the
   * new rule. An occurrence anyone ever booked is never deleted (D4, A29): the
   * refund and payout roll-ups read through it. One the new schedule no longer
   * has is detached, and cancelled too when nobody is still booked or waiting
   * on it (its rows are all cancelled), so it stops taking bookings.
   *
   * Returns { removed, created, cancelled }.
   */
  async regenerateSeries(
    parentId: string,
    now: Date = new Date(),
  ): Promise<{ removed: number; created: number; cancelled: number }> {
    const future = { seriesParentId: parentId, seriesDetached: false, startDateTime: { gt: now } };
    const del = await this.prisma.event.deleteMany({
      where: {
        ...future,
        registrations: { none: {} },
        stayBookings: { none: {} },
        refundRequests: { none: {} },
        payouts: { none: {} },
      },
    });
    // Reset the high-water mark so generation re-fills the whole window.
    await this.prisma.event.update({
      where: { id: parentId },
      data: { seriesGeneratedUntil: null },
    });
    const created = await this.generateOccurrences(parentId, now);

    // Survivors the new schedule no longer has.
    const parent = await this.prisma.event.findUnique({
      where: { id: parentId },
      select: { isRecurring: true, recurringRule: true, status: true, startDateTime: true },
    });
    const none = { removed: del.count, created, cancelled: 0 };
    if (!parent?.isRecurring || !parent.recurringRule || parent.status !== 'PUBLISHED') return none;
    let slots: Set<number>;
    try {
      const rule = parseRRule(parent.recurringRule);
      slots = new Set(
        expandRRule(parent.startDateTime, rule, { from: now, to: this.horizonFrom(now) }).map((d) => d.getTime()),
      );
    } catch {
      return none; // a bad rule: generateOccurrences already logged it
    }
    const kept = await this.prisma.event.findMany({
      where: future,
      select: {
        id: true,
        startDateTime: true,
        _count: { select: { registrations: { where: { status: { not: 'CANCELLED' } } } } },
      },
    });
    const off = kept.filter((o) => !slots.has(o.startDateTime.getTime()));
    if (!off.length) return none;
    await this.prisma.event.updateMany({ where: { id: { in: off.map((o) => o.id) } }, data: { seriesDetached: true } });
    const { count: cancelled } = await this.prisma.event.updateMany({
      where: { id: { in: off.filter((o) => o._count.registrations === 0).map((o) => o.id) }, status: 'PUBLISHED' },
      data: { status: 'CANCELLED', cancelledAt: now, cancellationReason: 'Removed from the series schedule' },
    });
    return { removed: del.count, created, cancelled };
  }

  /**
   * "This occurrence" edit (D3): detach one occurrence from the series so a
   * whole-series regeneration/propagation never overwrites or removes it. The
   * caller edits the row itself through the normal event-update path afterward.
   */
  async detachOccurrence(occurrenceId: string): Promise<void> {
    await this.prisma.event.update({
      where: { id: occurrenceId },
      data: { seriesDetached: true },
    });
  }
}
