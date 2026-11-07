import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { corsOriginCallback } from '../common/cors';
import { msUntilExpiry } from '../leaderboard/leaderboard.gateway';

/** What the app gets the moment a notification's in-app copy is written. */
export interface LiveNotification {
  type: string;
  eventId: string | null;
  title: string;
  body: string;
  deepLink: string | null;
  data: Record<string, unknown> | null;
}

export const userRoom = (userId: string) => `user-${userId}`;

/**
 * C13: each signed-in app joins its own room and gets its notifications live
 * while it's open, whether or not push is allowed. Signed-in only: unlike the
 * leaderboard namespace, a tokenless or bad token is refused. The socket is
 * dropped when its token expires; the app reconnects with a fresh one. The
 * Redis adapter (main.ts) relays emits across replicas.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: corsOriginCallback, credentials: true },
})
export class NotificationsGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly auth: AuthService) {}

  afterInit(ns: Namespace) {
    ns.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthorized')),
      );
    });
  }

  /** userId is settled in middleware, so joining here can't race it. */
  handleConnection(client: Socket) {
    if (client.data.userId) void client.join(userRoom(client.data.userId as string));
  }

  async authenticate(client: Socket) {
    const token: string | undefined =
      client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new Error('no token');
    const user = await this.auth.validateAccessToken(token);
    client.data.userId = user.id;
    const ms = msUntilExpiry(token);
    if (ms === null) return;
    const timer = setTimeout(() => client.disconnect(true), ms);
    timer.unref?.();
    client.once('disconnect', () => clearTimeout(timer));
  }

  /** One emit for everyone: the payload is the same for each of them. Best-effort. */
  toUsers(userIds: string[], n: LiveNotification) {
    if (!this.server || userIds.length === 0) return;
    try {
      this.server.to(userIds.map(userRoom)).emit('notification:new', n);
    } catch (err) {
      this.logger.warn(`notification:new emit failed: ${(err as Error).message}`);
    }
  }
}
