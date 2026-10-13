import { ExecutionContext, Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerStorage,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ThrottleIdentityService } from '../../auth/throttle-identity.service';

/**
 * Rate-limit tracker that buckets by the authenticated user when the request
 * carries a *verified* token, and by real client IP otherwise.
 *
 * Why this exists:
 *  1. The API sits behind Caddy (reverse_proxy -> backend). With `trust proxy`
 *     enabled in main.ts, `req.ip` is the real client instead of Caddy's
 *     container address, so anonymous traffic is no longer collapsed into one
 *     global bucket.
 *  2. On a shared network — a campus behind a single NAT public IP, where
 *     hundreds of students share that address — a per-IP limit still throttles
 *     everyone at once. For authenticated requests we key off the user id, so
 *     each signed-in user (and every operator dashboard tab, which fans out
 *     into many calls per load) gets its own bucket.
 *
 * The global `ThrottlerGuard` runs as an APP_GUARD, before any route-level
 * `JwtAuthGuard`, so `req.user` is not populated yet here. We therefore verify
 * the bearer token ourselves via ThrottleIdentityService (signature + expiry,
 * no DB). Crucially, a token that is present but does NOT verify falls back to
 * IP — never to a token-derived bucket — so a client cannot rotate random or
 * forged tokens to mint unlimited buckets and bypass the limit.
 */
@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly identity: ThrottleIdentityService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Server-side rendering on the web app calls the API over the private Docker
   * network (`http://backend:8080`) with `x-internal-key`. Every SSR request
   * would otherwise share the web container's single IP bucket, so a busy page
   * would 429 the whole public site. Unset INTERNAL_API_KEY = never skip.
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Record<string, any>>();
    if (isInternalRequest(req?.headers?.['x-internal-key'])) return true;
    return super.shouldSkip(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth: unknown = req.headers?.authorization;

    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      const token = auth.slice('Bearer '.length).trim();
      const userId = await this.identity.resolveUserId(token);
      if (userId) {
        return `user:${userId}`;
      }
      // Token present but unverifiable (forged/expired/garbage): fall through
      // to IP so token rotation can't escape the limit.
    }

    // Anonymous / untrusted request: key by the real client IP. When
    // `trust proxy` is set, `req.ips` holds the X-Forwarded-For chain in order,
    // so the first entry is the originating client; otherwise `req.ip` is
    // already correct.
    const ip =
      Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : req.ip;
    return `ip:${ip}`;
  }
}

const digest = (v: string) => createHash('sha256').update(v).digest();

export function isInternalRequest(
  presented: unknown,
  expected: string | undefined = process.env.INTERNAL_API_KEY,
): boolean {
  if (!expected || typeof presented !== 'string' || !presented) return false;
  return timingSafeEqual(digest(presented), digest(expected));
}
