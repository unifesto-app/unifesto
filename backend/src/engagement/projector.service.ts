import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Action, AuthorizationService } from '../auth/authorization';
import { LeaderboardGateway } from '../leaderboard/leaderboard.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { PlanConfigService } from '../subscription/plan-config.service';
import { BRANDING_SPACE_SELECT, resolveEventBranding } from '../white-label/branding.util';
import { displayTokenMatches } from './engagement.access';
import { PollsService } from './polls.service';
import { QuestionsService } from './questions.service';
import { QuizzesService } from './quizzes.service';

export type ProjectorMode = 'poll' | 'qa' | 'quiz';

/** A closed poll or ended quiz stays on screen this long, so the room sees the result. */
export const RESULTS_LINGER_MS = 5 * 60_000;

/**
 * What the projector shows on its own: whatever the organiser started, moved
 * or finished last. Live things always count; a finished one only while its
 * result lingers. Nothing recent means the Q&A wall.
 */
export function pickMode(
  candidates: { mode: Exclude<ProjectorMode, 'qa'>; live: boolean; at: Date | null }[],
  now = new Date(),
): ProjectorMode {
  let best: (typeof candidates)[number] | null = null;
  for (const c of candidates) {
    if (!c.at) continue;
    if (!c.live && now.getTime() - c.at.getTime() > RESULTS_LINGER_MS) continue;
    if (!best || c.at > best.at!) best = c;
  }
  return best?.mode ?? 'qa';
}

/**
 * L4 projector view. A read-only snapshot of the event's live engagement for
 * the venue screen, opened either with the event's display link (no login) or
 * by an operator who can run the event (event:edit). Built only from the
 * PII-free display reads of polls, Q&A and quizzes.
 */
@Injectable()
export class ProjectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
    private readonly planConfig: PlanConfigService,
    private readonly gateway: LeaderboardGateway,
    private readonly polls: PollsService,
    private readonly questions: QuestionsService,
    private readonly quizzes: QuizzesService,
  ) {}

  async assertCanView(eventId: string, token: string | undefined, userId: string | undefined) {
    if (token !== undefined) {
      if (await displayTokenMatches(this.prisma, eventId, token)) return;
      throw new ForbiddenException('This display link was turned off. Ask the organiser for a new one.');
    }
    if (userId && (await this.authz.can({ id: userId }, Action.EVENT_EDIT, { eventId }))) return;
    throw new ForbiddenException('Only the event team can open the projector view');
  }

  async snapshot(eventId: string, token: string | undefined, userId: string | undefined, now = new Date()) {
    await this.assertCanView(eventId, token, userId);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        title: true,
        whiteLabelEnabled: true,
        brandColor: true,
        space: { select: { subscription: true, ...BRANDING_SPACE_SELECT } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const has = event.space.subscription
      ? this.planConfig.getEffectiveLimits(event.space.subscription).hasRemoveBranding
      : false;
    const brand = resolveEventBranding(event, event.space, has);

    const [poll, questions, quiz] = await Promise.all([
      this.polls.display(eventId),
      this.questions.display(eventId),
      this.quizzes.display(eventId, now),
    ]);
    const mode = pickMode(
      [
        poll && { mode: 'poll' as const, live: poll.status === 'LIVE', at: poll.status === 'LIVE' ? poll.launchedAt : poll.closedAt },
        quiz && {
          mode: 'quiz' as const,
          live: quiz.status === 'LIVE',
          at: quiz.status === 'LIVE' ? (quiz.question?.openedAt ?? quiz.startedAt) : quiz.endedAt,
        },
      ].filter((c) => !!c),
      now,
    );
    return {
      serverNow: now.toISOString(),
      event: { title: event.title },
      brand: brand && { name: brand.name, color: brand.color, logoUrl: brand.logoUrl },
      mode,
      poll,
      questions,
      quiz,
    };
  }

  /** The display link's secret, made on first ask. */
  async getToken(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { displayToken: true } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.displayToken) return { token: event.displayToken };
    // Only fills an empty slot, so two first asks at once agree on one token.
    await this.prisma.event.updateMany({ where: { id: eventId, displayToken: null }, data: { displayToken: newToken() } });
    return this.getToken(eventId);
  }

  /** A new secret: every screen on the old link is dropped and can't come back. */
  async regenerateToken(eventId: string) {
    const token = newToken();
    const { count } = await this.prisma.event.updateMany({ where: { id: eventId }, data: { displayToken: token } });
    if (!count) throw new NotFoundException('Event not found');
    await this.gateway.dropDisplays(eventId);
    return { token };
  }
}

const newToken = () => randomBytes(24).toString('base64url');
