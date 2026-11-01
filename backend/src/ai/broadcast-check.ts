import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BroadcastHoldStatus,
  BroadcastKind,
  Prisma,
  SupportCaseKind,
  SupportDesk,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SUBJECT_CASE_OPEN,
  updateSubjectCase,
  type SubjectCaseOpen,
} from '../support/subject-cases';
import { AiService } from './ai.service';
import { broadcastCheckRequest, parseRiskVerdict } from './risk';
import { staffRequesterId } from './safety-case';

/** Staff released or blocked a hold: the broadcast's own service sends or cancels it. */
export const BROADCAST_DECIDED = 'ai.broadcast.decided';
export interface BroadcastDecided {
  kind: BroadcastKind;
  refId: string;
  release: boolean;
  /** What the sender stored to send it later (hackathon: its notification event). */
  payload: Prisma.JsonValue;
}

export interface Broadcast {
  kind: BroadcastKind;
  /** The EmailCampaign, PushCampaign or HackathonAnnouncement id. */
  refId: string;
  /** Null for Unifesto's own broadcasts, which are never checked. */
  spaceId: string | null;
  eventId?: string | null;
  /** The organiser sending it: staff hear about the case "from" them. */
  senderId: string;
  /** Subject or title, then the body as text. */
  text: string;
  payload?: Prisma.InputJsonValue;
}

const KIND_NAME: Record<BroadcastKind, string> = {
  EMAIL: 'email campaign',
  PUSH: 'push announcement',
  HACKATHON: 'hackathon announcement',
};

/**
 * AI19: Haiku reads an organiser's broadcast before it goes out. A flagged
 * message from an Unverified space is held as a Platform REPORT case until
 * staff release or block it; from a Verified space it goes out and the flag
 * is only logged. The check sends nothing itself (comms rule: AI drafts, a
 * person sends), and when it can't run (off, capped, failed) the message goes
 * out as it did before AI19.
 */
@Injectable()
export class BroadcastCheck {
  private readonly logger = new Logger(BroadcastCheck.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /** True when the broadcast may go out now. Never throws. */
  async clear(b: Broadcast): Promise<boolean> {
    try {
      const prior = await this.prisma.broadcastHold.findUnique({
        where: { kind_refId: { kind: b.kind, refId: b.refId } },
        select: { status: true },
      });
      if (prior) return prior.status === BroadcastHoldStatus.RELEASED;
      if (!b.spaceId) return true;

      const [space, event] = await Promise.all([
        this.prisma.space.findUnique({ where: { id: b.spaceId }, select: { name: true, verifiedAt: true } }),
        b.eventId ? this.prisma.event.findUnique({ where: { id: b.eventId }, select: { title: true } }) : null,
      ]);
      if (!space) return true;
      const res = await this.ai.run('broadcast_check', {
        ...broadcastCheckRequest({ kind: b.kind, space: space.name, event: event?.title, text: b.text }),
        subject: `${b.kind.toLowerCase()}:${b.refId}`,
        spaceId: b.spaceId,
      });
      const v = res.ok ? parseRiskVerdict(res.json) : null;
      if (!v?.flag) return true;
      if (space.verifiedAt) {
        this.logger.warn(`Broadcast check flagged ${KIND_NAME[b.kind]} ${b.refId} from verified space ${b.spaceId}, sent anyway: ${v.reason}`);
        return true;
      }
      const requesterId = await staffRequesterId(this.prisma);
      if (!requesterId || !this.events) {
        this.logger.warn(`Broadcast check flagged ${KIND_NAME[b.kind]} ${b.refId} but no case could open, sent: ${v.reason}`);
        return true;
      }

      const hold = await this.prisma.broadcastHold.create({
        data: {
          kind: b.kind,
          refId: b.refId,
          spaceId: b.spaceId,
          eventId: b.eventId ?? null,
          preview: b.text.slice(0, 6000),
          reason: v.reason,
          payload: b.payload,
        },
      });
      const [caseId] = (await this.events.emitAsync(SUBJECT_CASE_OPEN, {
        subjectType: 'BroadcastHold',
        subjectId: hold.id,
        requesterId,
        actorId: b.senderId,
        kind: SupportCaseKind.REPORT,
        desk: SupportDesk.PLATFORM,
        spaceId: b.spaceId,
        eventId: b.eventId ?? null,
        raisedForRequester: true,
        notify: true,
        subject: `Held ${KIND_NAME[b.kind]} from ${space.name}`,
        message: [
          `Assist's broadcast check held this ${KIND_NAME[b.kind]} from the Unverified space ${space.name}. Nothing has gone out. Release sends it as written; Block stops it.`,
          `Why: ${v.reason}`,
          `Signals: ${v.signals.join(', ') || 'none named'}`,
          'This is a suggestion from AI. Read the message before deciding.',
        ].join('\n'),
      } satisfies SubjectCaseOpen)) as (string | null)[];
      if (caseId) return false;
      // Nobody would see a hold without its case, so it goes out instead.
      await this.prisma.broadcastHold.delete({ where: { id: hold.id } });
      this.logger.warn(`Broadcast check flagged ${KIND_NAME[b.kind]} ${b.refId} but its case did not open, sent: ${v.reason}`);
      return true;
    } catch (err) {
      // A second worker raced us to the hold: it is held either way.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      this.logger.error(`Broadcast check of ${b.kind} ${b.refId} failed, sent: ${(err as Error).message}`);
      return true;
    }
  }

  /** Staff release or block a held broadcast, from its Assist case. */
  async decide(id: string, release: boolean, staffId: string, note?: string): Promise<{ status: BroadcastHoldStatus }> {
    const status = release ? BroadcastHoldStatus.RELEASED : BroadcastHoldStatus.BLOCKED;
    const claimed = await this.prisma.broadcastHold.updateMany({
      where: { id, status: BroadcastHoldStatus.HELD },
      data: { status, decidedById: staffId, decidedAt: new Date() },
    });
    const hold = await this.prisma.broadcastHold.findUnique({ where: { id } });
    if (!hold) throw new NotFoundException('Held message not found');
    if (!claimed.count) throw new BadRequestException('This message was already released or blocked');

    this.events?.emit(BROADCAST_DECIDED, {
      kind: hold.kind,
      refId: hold.refId,
      release,
      payload: hold.payload,
    } satisfies BroadcastDecided);
    updateSubjectCase(this.events, {
      subjectType: 'BroadcastHold',
      subjectId: id,
      actorId: staffId,
      text: `${release ? 'Released: the message goes out now.' : 'Blocked: the message will not be sent.'}${note ? ` Note: ${note}` : ''}`,
      status: SupportTicketStatus.RESOLVED,
    });
    return { status };
  }
}
