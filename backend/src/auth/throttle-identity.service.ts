import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Resolves a *verified* user id from a bearer token, for rate-limit bucketing.
 *
 * The throttler must not trust an unverified token: if it keyed buckets off any
 * `Bearer <string>`, a client could rotate random tokens to mint unlimited
 * buckets and bypass the limit entirely. This service verifies the token's
 * signature/expiry (the same token JwtAuthGuard accepts) and returns its user
 * id, or `null` when the token is absent, malformed, forged, or expired — so the
 * caller falls back to IP-based limiting for anything it can't trust.
 *
 * It deliberately does NOT load the user from the database (that is the auth
 * guard's job on protected routes). This runs on every request, so it stays
 * cheap: an HMAC verify, memoised briefly to avoid re-verifying the same token
 * on back-to-back requests.
 */
@Injectable()
export class ThrottleIdentityService {
  private readonly logger = new Logger(ThrottleIdentityService.name);
  private readonly jwtSecret: string;

  // Positive-result cache: sha256(token) -> { userId, expiresAtMs }. Bounded in
  // size; entries live ~one rate-limit window since that is all we need.
  private readonly cache = new Map<
    string,
    { userId: string; expiresAtMs: number }
  >();
  private static readonly CACHE_TTL_MS = 60_000;
  private static readonly MAX_CACHE_ENTRIES = 10_000;

  constructor(private readonly config: ConfigService) {
    this.jwtSecret = this.config.get<string>('JWT_SECRET') ?? '';
  }

  /**
   * @returns the verified user id, or null if the token can't be trusted.
   */
  async resolveUserId(token: string | undefined): Promise<string | null> {
    if (!token) return null;

    const key = createHash('sha256').update(token).digest('hex');
    const cached = this.cache.get(key);
    if (cached) {
      if (cached.expiresAtMs > Date.now()) return cached.userId;
      this.cache.delete(key);
    }

    const userId = await this.verify(token);
    if (userId) this.remember(key, userId);
    return userId;
  }

  private async verify(token: string): Promise<string | null> {
    // HMAC verify against JWT_SECRET, the only bearer token JwtAuthGuard accepts.
    if (!this.jwtSecret) return null;
    try {
      const verified = jwt.verify(token, this.jwtSecret) as {
        userId?: string;
        type?: string;
      };
      // Refresh tokens are not identities for API traffic — ignore them.
      if (verified?.type === 'refresh') return null;
      return verified?.userId ?? null;
    } catch {
      return null; // malformed/forged/expired -> untrusted
    }
  }

  private remember(key: string, userId: string): void {
    // Coarse bound: clear wholesale if it grows too large. Simpler than an LRU
    // and fine because entries are short-lived and cheap to rebuild.
    if (this.cache.size >= ThrottleIdentityService.MAX_CACHE_ENTRIES) {
      this.cache.clear();
    }
    this.cache.set(key, {
      userId,
      expiresAtMs: Date.now() + ThrottleIdentityService.CACHE_TTL_MS,
    });
  }
}
