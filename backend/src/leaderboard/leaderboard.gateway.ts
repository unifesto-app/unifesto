import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { LeaderboardService } from './leaderboard.service';

interface AuthedSocket extends Socket {
  userId?: string | null;
}

const room = (eventId: string) => `board:${eventId}`;

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
 * viewable without a token. We authenticate opportunistically (to recognise
 * managers/judges and registered attendees) but never reject a tokenless
 * socket at connect time — authorization happens per-subscription in
 * LeaderboardService.canView, which is the single source of truth shared with
 * the HTTP endpoint.
 *
 * Single in-memory adapter for now (one backend container).
 * To scale horizontally, register @socket.io/redis-adapter over the existing
 * Redis so `broadcast` fans out across instances.
 */
@WebSocketGateway({
  namespace: '/leaderboard',
  cors: { origin: [/\.unifesto\.app$/, /^http:\/\/localhost/], credentials: true },
})
export class LeaderboardGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(LeaderboardGateway.name);

  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => LeaderboardService))
    private readonly leaderboard: LeaderboardService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    client.userId = null;
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return; // anonymous viewer — allowed
    try {
      const user = await this.authService.validateAccessToken(token);
      client.userId = user?.id ?? null;
    } catch {
      // Bad token → treated as anonymous, not rejected.
      client.userId = null;
    }
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
    const snapshot = await this.leaderboard.getPublicSnapshot(eventId);
    client.emit('snapshot', snapshot);
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

  /** Push a fresh ranked snapshot to everyone watching this event's board. */
  broadcast(eventId: string, snapshot: unknown) {
    if (!snapshot) return;
    this.server.to(room(eventId)).emit('rank:update', snapshot);
  }
}
