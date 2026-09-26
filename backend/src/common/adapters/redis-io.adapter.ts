import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../../redis/redis.service';

/**
 * Socket.IO adapter backed by Redis pub/sub so WebSocket broadcasts
 * (leaderboard) reach clients across every backend replica.
 *
 * The default in-memory adapter keeps each replica's connected sockets in that
 * process only, so an emit on replica A never reaches a socket on replica B.
 * Once the backend runs more than one replica that silently breaks realtime.
 * This adapter relays every emit through the app's existing Redis connection,
 * and each replica rebroadcasts to its own local sockets.
 *
 * If Redis is unavailable we fall back to the in-memory adapter and log loudly:
 * realtime then only works correctly on a single replica.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly appContext: INestApplicationContext) {
    super(appContext);
  }

  connectToRedis(): boolean {
    // Dedicated pub/sub connections, NOT the shared cache client. getClient()
    // is null during the connection window (and after a failed startup ping),
    // which previously made this latch onto the in-memory adapter. createClient()
    // returns a connecting client that buffers until ready, so the adapter comes
    // up regardless of startup timing. The subscriber must be its own connection
    // (it enters subscribe mode), so we build two.
    const redisService = this.appContext.get(RedisService);
    const pubClient = redisService.createClient();
    const subClient = redisService.createClient();

    if (!pubClient || !subClient) {
      this.logger.warn(
        'Redis unavailable — Socket.IO using in-memory adapter. ' +
          'Cross-replica broadcast will NOT work; run a single backend replica.',
      );
      return false;
    }

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log(
      'Socket.IO Redis adapter enabled — cross-replica broadcast active',
    );
    return true;
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
