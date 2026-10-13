import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';

export type OtpVerifyResult = 'ok' | 'invalid' | 'blocked';

/**
 * One-time codes for email and mobile sign-in, stored in Redis.
 *
 * Brute-force limits (S7):
 * - codes come from crypto.randomInt, never Math.random;
 * - every guess atomically INCRs `otp-limit:attempts:<id>` BEFORE the compare, so
 *   concurrent guesses can't slip past the cap;
 * - that counter is NOT reset by sending a new code (it lives for
 *   ATTEMPT_WINDOW_SECONDS from the first wrong guess), so "resend after 4
 *   guesses" no longer buys more guesses;
 * - sends are limited per identifier: a cooldown between sends and a daily cap
 *   (also caps WhatsApp OTP spend).
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  static readonly OTP_EXPIRY_SECONDS = 10 * 60;
  static readonly MAX_ATTEMPTS = 5;
  static readonly ATTEMPT_WINDOW_SECONDS = 15 * 60;
  static readonly SEND_COOLDOWN_SECONDS = 30;
  static readonly DAILY_SEND_CAP = 10;

  constructor(private readonly redisService: RedisService) {}

  generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Reserve a send slot for this identifier: throws 429 inside the cooldown or
   * past the daily cap. No Redis → allowed (the code can't be stored anyway).
   */
  async assertCanSend(identifier: string): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    const cooled = await client.set(
      `otp-limit:cooldown:${identifier}`,
      '1',
      'EX',
      OtpService.SEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooled !== 'OK') {
      throw new HttpException(
        'Please wait a few seconds before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const sent = await incrWithTtl(client, `otp-limit:daily:${identifier}`, 24 * 60 * 60);
    if (sent > OtpService.DAILY_SEND_CAP) {
      throw new HttpException(
        'Too many codes requested today. Please try again tomorrow.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async storeOtp(identifier: string, otp: string): Promise<void> {
    await this.redisService.set(
      `otp:${identifier}`,
      JSON.stringify({ otp }),
      OtpService.OTP_EXPIRY_SECONDS,
    );
  }

  async verifyOtp(identifier: string, otp: string): Promise<OtpVerifyResult> {
    const client = this.redisService.getClient();
    if (!client) return 'invalid';
    const key = `otp:${identifier}`;
    const attemptsKey = `otp-limit:attempts:${identifier}`;

    // Count the guess first, atomically. Only then look at the code.
    const attempts = await incrWithTtl(client, attemptsKey, OtpService.ATTEMPT_WINDOW_SECONDS);
    if (attempts > OtpService.MAX_ATTEMPTS) {
      await client.del(key);
      this.logger.warn(`OTP locked for ${identifier} (${attempts} attempts)`);
      return 'blocked';
    }

    const raw = await client.get(key);
    if (!raw || typeof otp !== 'string') return 'invalid';
    let stored: string | undefined;
    try {
      stored = JSON.parse(raw)?.otp;
    } catch {
      return 'invalid';
    }
    if (typeof stored !== 'string' || !safeEqual(stored, otp)) return 'invalid';

    // Single use: only the caller whose DEL removes the key wins.
    if ((await client.del(key)) !== 1) return 'invalid';
    await client.del(attemptsKey);
    return 'ok';
  }
}

/**
 * INCR, and make sure the counter expires. Also re-arms a TTL-less key (the
 * process died between INCR and EXPIRE), which would otherwise lock the
 * identifier out forever.
 */
async function incrWithTtl(
  client: NonNullable<ReturnType<RedisService['getClient']>>,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const n = await client.incr(key);
  if (n === 1 || (await client.ttl(key)) === -1) await client.expire(key, ttlSeconds);
  return n;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
