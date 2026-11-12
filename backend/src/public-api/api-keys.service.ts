import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { bearerKey, generateKey, hashKey } from './api-key.util';

/** At most this many live keys per space: enough for a site and its staging. */
export const MAX_KEYS = 5;

export interface ResolvedKey {
  id: string;
  spaceId: string;
  name: string;
  prefix: string;
  integrationsEnabled: boolean;
}

/** K22: a space's registration API keys. Managed from the console by Space Admins. */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** The space's switch and its live keys (never the key itself: only its prefix). */
  async list(spaceId: string) {
    const [space, keys] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: spaceId }, select: { integrationsEnabled: true } }),
      this.prisma.spaceApiKey.findMany({
        where: { spaceId, revokedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
      }),
    ]);
    if (!space) throw new NotFoundException('Space not found');
    return { enabled: space.integrationsEnabled, keys };
  }

  /** Returns the key once; only its hash is stored. */
  async create(spaceId: string, userId: string, name: string) {
    const space = await this.prisma.space.findUnique({ where: { id: spaceId }, select: { integrationsEnabled: true } });
    if (!space) throw new NotFoundException('Space not found');
    if (!space.integrationsEnabled) {
      throw new ForbiddenException('API access is off for this space. Write to Unifesto support to turn it on.');
    }
    const live = await this.prisma.spaceApiKey.count({ where: { spaceId, revokedAt: null } });
    if (live >= MAX_KEYS) throw new BadRequestException(`A space can have ${MAX_KEYS} keys. Revoke one first.`);
    const { key, prefix, hash } = generateKey();
    const row = await this.prisma.spaceApiKey.create({
      data: { spaceId, name: name.trim().slice(0, 60), prefix, keyHash: hash, createdBy: userId },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });
    return { ...row, key };
  }

  async revoke(spaceId: string, id: string) {
    const { count } = await this.prisma.spaceApiKey.updateMany({
      where: { id, spaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count) throw new NotFoundException('Key not found');
    return { revoked: true };
  }

  /** "Bearer uf_live_…" → its live key, or null. */
  async resolve(authorization: string | undefined): Promise<ResolvedKey | null> {
    const raw = bearerKey(authorization);
    if (!raw) return null;
    const key = await this.prisma.spaceApiKey.findUnique({
      where: { keyHash: hashKey(raw) },
      select: { id: true, spaceId: true, name: true, prefix: true, revokedAt: true, lastUsedAt: true, space: { select: { integrationsEnabled: true } } },
    });
    if (!key || key.revokedAt) return null;
    // At most one write a minute per key, off the request's path.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      void this.prisma.spaceApiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    }
    return { id: key.id, spaceId: key.spaceId, name: key.name, prefix: key.prefix, integrationsEnabled: key.space.integrationsEnabled };
  }

  /**
   * Counts one use against a fixed window and says whether it went over.
   * Without Redis it lets the call through, like the global throttler.
   */
  async over(counter: string, limit: number, windowSeconds: number): Promise<boolean> {
    const client = this.redis.getClient();
    if (!client) return false;
    const key = `apikey-${counter}`;
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, windowSeconds);
    return n > limit;
  }
}
