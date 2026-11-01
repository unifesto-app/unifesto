import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SupportCaseKind, SupportDesk } from '@prisma/client';
import { OnEvent } from '../common/on-event';
import { PrismaService } from '../prisma/prisma.service';
import { SUBJECT_CASE_OPEN, type SubjectCaseOpen } from '../support/subject-cases';
import { AiService } from './ai.service';
import { parseRiskVerdict, riskScreenRequest, type RiskListing, type RiskVerdict } from './risk';
import { RISK_SCREEN, type RiskScreenRequest } from './risk-screen.events';
import { staffRequesterId } from './safety-case';

/**
 * AI3: Haiku reads a new space, or a space's first published event, for scam
 * signals and opens a Platform REPORT case with the reason when it sees one.
 * It never blocks, unpublishes or holds money (D7): it runs after the request
 * has finished, and the space and event stay live whatever it says. Verified
 * spaces are skipped: a person already checked who runs them.
 */
@Injectable()
export class RiskScreen {
  private readonly logger = new Logger(RiskScreen.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  @OnEvent(RISK_SCREEN, { async: true })
  async onScreen(e: RiskScreenRequest): Promise<void> {
    try {
      if ('eventId' in e) await this.screenEvent(e.eventId, e.actorId);
      else await this.screenSpace(e.spaceId, e.actorId);
    } catch (err) {
      this.logger.error(`Risk screen of ${JSON.stringify(e)} failed: ${(err as Error).message}`);
    }
  }

  async screenSpace(spaceId: string, actorId: string): Promise<void> {
    const space = await this.prisma.space.findUnique({
      where: { id: spaceId },
      select: { id: true, name: true, slug: true, description: true, websiteUrl: true, city: true, verifiedAt: true },
    });
    if (!space || space.verifiedAt) return;
    const v = await this.ask({ space }, `space:${space.id}`, space.id);
    if (!v) return;
    await this.openCase(v, actorId, {
      subjectType: 'Space',
      subjectId: space.id,
      spaceId: space.id,
      subject: `Risk screen: new space ${space.name}`,
      what: `the new space "${space.name}" (unifesto.app/s/${space.slug})`,
    });
  }

  async screenEvent(eventId: string, actorId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        slug: true,
        description: true,
        venueName: true,
        venueAddress: true,
        city: true,
        onlineUrl: true,
        spaceId: true,
        space: { select: { name: true, description: true, websiteUrl: true, city: true, verifiedAt: true } },
        ticketTypes: { select: { name: true, price: true, description: true } },
      },
    });
    if (!event || event.space.verifiedAt) return;
    // Only the space's first published event: later ones come from a space staff already had a chance to see.
    const earlier = await this.prisma.event.count({
      where: { spaceId: event.spaceId, publishedAt: { not: null }, id: { not: event.id } },
    });
    if (earlier) return;
    const v = await this.ask(
      {
        space: event.space,
        event: {
          title: event.title,
          description: event.description,
          venue: [event.venueName, event.venueAddress, event.city].filter(Boolean).join(', ') || null,
          onlineUrl: event.onlineUrl,
          tickets: event.ticketTypes.map((t) => ({ name: t.name, price: Number(t.price), description: t.description })),
        },
      },
      `event:${event.id}`,
      event.spaceId,
    );
    if (!v) return;
    await this.openCase(v, actorId, {
      subjectType: 'Event',
      subjectId: event.id,
      spaceId: event.spaceId,
      eventId: event.id,
      subject: `Risk screen: first event ${event.title}`,
      what: `"${event.title}" (unifesto.app/e/${event.slug}), the first event of ${event.space.name}`,
    });
  }

  /** The verdict when the model flagged it; null when it didn't, or couldn't run (off, capped, failed). */
  private async ask(listing: RiskListing, subject: string, spaceId: string): Promise<RiskVerdict | null> {
    const res = await this.ai.run('risk_screen', { ...riskScreenRequest(listing), subject, spaceId });
    if (!res.ok) {
      if (res.reason !== 'disabled') this.logger.warn(`Risk screen of ${subject} did not run: ${res.reason}`);
      return null;
    }
    const v = parseRiskVerdict(res.json);
    return v?.flag ? v : null;
  }

  private async openCase(
    v: RiskVerdict,
    actorId: string,
    c: Pick<SubjectCaseOpen, 'subjectType' | 'subjectId' | 'spaceId' | 'eventId' | 'subject'> & { what: string },
  ): Promise<void> {
    const requesterId = await staffRequesterId(this.prisma);
    if (!requesterId || !this.events) {
      this.logger.warn(`Risk screen flagged ${c.subjectType} ${c.subjectId} but no case could open: ${v.reason}`);
      return;
    }
    const { what, ...where } = c;
    await this.events.emitAsync(SUBJECT_CASE_OPEN, {
      ...where,
      requesterId,
      actorId,
      kind: SupportCaseKind.REPORT,
      desk: SupportDesk.PLATFORM,
      raisedForRequester: true,
      notify: true,
      message: [
        `Assist's risk screen flagged ${what} for a look. It is still live: nothing was blocked, unpublished or held.`,
        `Why: ${v.reason}`,
        `Signals: ${v.signals.join(', ') || 'none named'}`,
        'This is a suggestion from AI. Check the space before acting on it.',
      ].join('\n'),
    } satisfies SubjectCaseOpen);
  }
}
