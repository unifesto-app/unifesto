import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Namespace, Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../auth/auth.service';
import { corsOriginCallback } from '../common/cors';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationService } from '../auth/authorization';
import { canJoinEngagement, engagementRoom } from '../engagement/engagement.access';
import { LeaderboardService } from './leaderboard.service';

interface AuthedSocket extends Socket {
  userId?: string | null;
}

const room = (eventId: string) => `board:${eventId}`;

/** Reconnect storms re-read the same board; 2 s is fresh enough (S36). */
const SNAPSHOT_CACHE_SECONDS = 2;
const snapshotKey = (eventId: string) => `lb:snapshot:${eventId}`;
const MAX_TIMER_MS = 2 ** 31 - 1;
/**
 * Engagement pings per event are coalesced into one per window: a vote flood
 * from a big room otherwise makes every client refetch on every vote.
 * ponytail: each client still refetches once per window; cache the feed counts
 * in Redis if rooms grow past a few thousand live voters.
 */
export const ENGAGEMENT_PING_MS = 2000;

/**
 * Milliseconds until this JWT expires, or null when it carries no `exp`.
 * Clamped to setTimeout's ceiling (an early disconnect just reconnects).
 */
export function msUntilExpiry(token: string, now = Date.now()): number | null {
  const exp = (jwt.decode(token) as { exp?: number } | null)?.exp;
  if (!exp) return null;
  return Math.min(Math.max(exp * 1000 - now, 0), MAX_TIMER_MS);
}

/**
 * Hackathon queue rooms. Only a "something changed" ping goes out on them
 * (`hackathon:changed`, no data): each client refetches over HTTP, where the
 * privacy rules live, so a socket can never leak marks or another team's queue.
 */
export const hackathonRooms = {
  manage: (eventId: string) => `hq:manage:${eventId}`,
  judge: (eventId: string, userId: string) => `hq:judge:${eventId}:${userId}`,
  team: (entrantId: string) => `hq:team:${entrantId}`,
};

/**
 * Real-time leaderboard namespace.
 *
 * Connections here may be ANONYMOUS: a public board is
 * viewable without a token. We authenticate opportunistically in namespace
 * middleware (to recognise managers/judges and registered attendees) but never
 * reject a tokenless socket at connect time — authorization happens per-subscription in
 * LeaderboardService.canView, which is the single source of truth shared with
 * the HTTP endpoint.
 *
 * Single in-memory adapter for now (one backend container).
 * To scale horizontally, register @socket.io/redis-adapter over the existing
 * Redis so `broadcast` fans out across instances.
 */
@WebSocketGateway({
  namespace: '/leaderboard',
  cors: { origin: corsOriginCallback, credentials: true },
})
export class LeaderboardGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LeaderboardGateway.name);

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => LeaderboardService))
    private readonly leaderboard: LeaderboardService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly authz: AuthorizationService,
  ) {}

  private readonly engagementPending = new Set<string>();

  /**
   * Authenticate in namespace middleware, so `userId` is settled before any
   * message handler runs (an async handleConnection raced the first
   * `hackathon:subscribe`). Tokenless or bad tokens still connect anonymously.
   */
  afterInit(ns: Namespace) {
    ns.use((socket, next) => {
      this.authenticate(socket as AuthedSocket).then(
        () => next(),
        () => next(),
      );
    });
  }

  async authenticate(client: AuthedSocket) {
    client.userId = null;
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return; // anonymous viewer — allowed
    try {
      const user = await this.authService.validateAccessToken(token);
      client.userId = user?.id ?? null;
    } catch {
      return; // Bad token → treated as anonymous, not rejected.
    }
    // Drop the socket when its token expires, so a revoked/expired session
    // can't keep receiving pings; the client reconnects with a fresh token.
    const ms = msUntilExpiry(token);
    if (ms === null) return;
    const timer = setTimeout(() => client.disconnect(true), ms);
    timer.unref?.();
    client.once('disconnect', () => clearTimeout(timer));
  }

  /** getPublicSnapshot behind a 2 s shared cache; fails open without Redis. */
  async cachedSnapshot(eventId: string) {
    const key = snapshotKey(eventId);
    try {
      const hit = await this.redis.get(key);
      if (hit !== null) return JSON.parse(hit);
    } catch {
      /* Redis down: read through */
    }
    const snapshot = await this.leaderboard.getPublicSnapshot(eventId);
    this.redis
      .set(key, JSON.stringify(snapshot), SNAPSHOT_CACHE_SECONDS)
      .catch(() => undefined);
    return snapshot;
  }

  @SubscribeMessage('subscribe')
  async onSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { eventId: string },
  ) {
    const eventId = body?.eventId;
    if (!eventId) return { error: 'eventId required' };

    const allowed = await this.leaderboard.canView(eventId, client.userId ?? null);
    if (!allowed) {
      return { error: 'not_authorized' };
    }
    client.join(room(eventId));
    client.emit('snapshot', await this.cachedSnapshot(eventId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { eventId: string },
  ) {
    if (body?.eventId) client.leave(room(body.eventId));
    return { ok: true };
  }

  /**
   * Join the hackathon rooms this user belongs to on the event: the curator
   * room, their judge room, their team's room. Decided server-side; the client
   * only says which event.
   */
  @SubscribeMessage('hackathon:subscribe')
  async onHackathonSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { eventId: string },
  ) {
    const eventId = body?.eventId;
    if (!eventId) return { error: 'eventId required' };
    if (!client.userId) return { error: 'not_authorized' };
    const rooms = await this.leaderboard.hackathonRoomsFor(eventId, client.userId);
    if (!rooms.length) return { error: 'not_authorized' };
    for (const r of rooms) client.join(r);
    return { ok: true };
  }

  @SubscribeMessage('hackathon:unsubscribe')
  onHackathonUnsubscribe(@ConnectedSocket() client: AuthedSocket) {
    for (const r of client.rooms) if (r.startsWith('hq:')) client.leave(r);
    return { ok: true };
  }

  /**
   * Tell the curators, the given judges and the given teams that the queue
   * moved. Best-effort: realtime is a nicety, the app also polls.
   */
  hackathonChanged(eventId: string, targets: { judgeUserIds?: string[]; entrantIds?: string[] } = {}) {
    if (!this.server) return;
    try {
      const rooms = [
        hackathonRooms.manage(eventId),
        ...(targets.judgeUserIds ?? []).map((id) => hackathonRooms.judge(eventId, id)),
        ...(targets.entrantIds ?? []).map((id) => hackathonRooms.team(id)),
      ];
      this.server.to([...new Set(rooms)]).emit('hackathon:changed', { eventId });
    } catch (err) {
      this.logger.warn(`hackathon:changed ping failed: ${(err as Error).message}`);
    }
  }

  /**
   * Live engagement room for one event (polls; later Q&A and quizzes). Like
   * the hackathon rooms it only carries "refetch" pings: what each person sees
   * is decided by the HTTP feed.
   */
  @SubscribeMessage('engagement:subscribe')
  async onEngagementSubscribe(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { eventId: string },
  ) {
    const eventId = body?.eventId;
    if (!eventId) return { error: 'eventId required' };
    if (!(await canJoinEngagement(this.prisma, this.authz, eventId, client.userId))) {
      return { error: 'not_authorized' };
    }
    client.join(engagementRoom(eventId));
    return { ok: true };
  }

  @SubscribeMessage('engagement:unsubscribe')
  onEngagementUnsubscribe(@ConnectedSocket() client: AuthedSocket) {
    for (const r of client.rooms) if (r.startsWith('eng:')) client.leave(r);
    return { ok: true };
  }

  /** Tell the event's engagement room something changed, at most once per ENGAGEMENT_PING_MS. */
  engagementChanged(eventId: string) {
    if (!this.server || this.engagementPending.has(eventId)) return;
    this.engagementPending.add(eventId);
    const timer = setTimeout(() => {
      this.engagementPending.delete(eventId);
      this.server.to(engagementRoom(eventId)).emit('engagement:changed', { eventId });
    }, ENGAGEMENT_PING_MS);
    timer.unref?.();
  }

  /** Push a fresh ranked snapshot to everyone watching this event's board. */
  broadcast(eventId: string, snapshot: unknown) {
    if (!snapshot) return;
    // Refresh the cache too, so a subscribe right after never sees the old board.
    this.redis
      .set(snapshotKey(eventId), JSON.stringify(snapshot), SNAPSHOT_CACHE_SECONDS)
      .catch(() => undefined);
    this.server.to(room(eventId)).emit('rank:update', snapshot);
  }
}
