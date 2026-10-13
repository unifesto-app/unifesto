import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
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
 *  - D4: never delete/move an occurrence that has registrations; a detached or
 *    registered occurrence is frozen and edited individually.
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
    parent: Prisma.EventGetPayload<{ include: { ticketTypes: true } }>,
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
      include: { ticketTypes: true },
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

    let created = 0;
    for (const start of toCreate) {
      const end = new Date(start.getTime() + durationMs);
      try {
        await this.prisma.$transaction(async (tx) => {
          const occ = await tx.event.create({
            data: this.occurrenceDataFromParent(parent, start, end),
          });
          if (parent.ticketTypes.length) {
            await tx.eventTicketType.createMany({
              data: parent.ticketTypes.map((t) => ({
                eventId: occ.id,
                name: t.name,
                description: t.description,
                price: t.price,
                currency: t.currency,
                totalQuantity: t.totalQuantity,
                // Fresh occurrence: nothing sold yet.
                soldCount: 0,
                kind: t.kind,
                groupPricingMode: t.groupPricingMode,
                minGroupSize: t.minGroupSize,
                maxGroupSize: t.maxGroupSize,
                saleStartsAt: t.saleStartsAt,
                saleEndsAt: t.saleEndsAt,
                perUserLimit: t.perUserLimit,
                waitlistEnabled: t.waitlistEnabled,
                waitlistOfferTtlHours: t.waitlistOfferTtlHours,
                isVisible: t.isVisible,
                isActive: t.isActive,
                order: t.order,
              })),
            });
          }
        });
      } catch (err) {
        // Another runner created this slot between our read and the insert;
        // the unique index rolled our copy back. Not an error.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        throw err;
      }
      created += 1;
    }

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
   * Regenerate after the parent's RRULE changed: drop future occurrences that
   * are safe to remove (not started, not detached, no registrations), then
   * re-materialize from the new rule. Never deletes a registered or detached
   * occurrence — those survive as individually-managed events.
   *
   * Returns { removed, created }.
   */
  async regenerateSeries(
    parentId: string,
    now: Date = new Date(),
  ): Promise<{ removed: number; created: number }> {
    const del = await this.prisma.event.deleteMany({
      where: {
        seriesParentId: parentId,
        seriesDetached: false,
        registeredCount: 0,
        startDateTime: { gt: now },
      },
    });
    // Reset the high-water mark so generation re-fills the whole window.
    await this.prisma.event.update({
      where: { id: parentId },
      data: { seriesGeneratedUntil: null },
    });
    const created = await this.generateOccurrences(parentId, now);
    return { removed: del.count, created };
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
