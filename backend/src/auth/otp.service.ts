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
 *
 * Lockout abuse (S49): guesses and sends are also counted per (identifier, IP)
 * and per IP, and the per-IP buckets are checked first. One attacker IP hits
 * its own limits and is locked out alone; the victim (on another IP) keeps
 * working until several IPs gang up on the same identifier, where the
 * identifier-wide caps still bound brute force and spend.
 *
 * J17: the identifier-wide guess cap was 15, so 3 IPs x 5 guesses locked any
 * user out (and deleted their live code). It is now 40 (8 IPs), well above
 * anything one person does, so the per-IP buckets are the real defence and
 * the identifier cap is only a botnet backstop: 40 guesses per 15 min against
 * a 6-digit code is still only ~0.4% a day for an attacker with 8+ IPs.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  static readonly OTP_EXPIRY_SECONDS = 10 * 60;
  /** Wrong guesses per identifier from one IP, per window. */
  static readonly MAX_ATTEMPTS = 5;
  /** Wrong guesses per identifier from all IPs, per window (botnet backstop). */
  static readonly MAX_ATTEMPTS_TOTAL = 40;
  /** Wrong guesses from one IP across all identifiers (campus NATs share one). */
  static readonly IP_MAX_ATTEMPTS = 50;
  static readonly ATTEMPT_WINDOW_SECONDS = 15 * 60;
  static readonly SEND_COOLDOWN_SECONDS = 30;
  /** Sends per identifier from one IP, per day. */
  static readonly DAILY_SEND_CAP = 10;
  /** Sends per identifier from all IPs, per day (WhatsApp spend backstop). */
  static readonly DAILY_SEND_CAP_TOTAL = 20;
  /** Sends from one IP across all identifiers, per hour. */
  static readonly IP_HOURLY_SEND_CAP = 100;

  constructor(private readonly redisService: RedisService) {}

  generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Reserve a send slot for this identifier: throws 429 inside the cooldown or
   * past the daily cap. 503 without Redis: the code couldn't be stored, so
   * never claim it was sent.
   */
  async assertCanSend(identifier: string, ip = 'unknown'): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) throw unavailable();
    const cooled = await client.set(
      `otp-limit:cooldown:${identifier}:${ip}`,
      '1',
      'EX',
      OtpService.SEND_COOLDOWN_SECONDS,
      'NX',
    );
    if (cooled !== 'OK') {
      throw tooMany('Please wait a few seconds before requesting another code.');
    }
    // Per-IP buckets first, so a rejected attacker never spends the victim's.
    if ((await incrWithTtl(client, `otp-limit:ip-sends:${ip}`, 60 * 60)) > OtpService.IP_HOURLY_SEND_CAP) {
      throw tooMany('Too many codes requested from this network. Please try again later.');
    }
    const day = 24 * 60 * 60;
    if (
      (await incrWithTtl(client, `otp-limit:daily:${identifier}:${ip}`, day)) > OtpService.DAILY_SEND_CAP ||
      (await incrWithTtl(client, `otp-limit:daily:${identifier}`, day)) > OtpService.DAILY_SEND_CAP_TOTAL
    ) {
      throw tooMany('Too many codes requested today. Please try again tomorrow.');
    }
  }

  /**
   * Undo assertCanSend after a failed delivery (J17): the user didn't get a
   * code, so it mustn't count against their caps or hold the cooldown.
   */
  async releaseSend(identifier: string, ip = 'unknown'): Promise<void> {
    const client = this.redisService.getClient();
    if (!client) return;
    await client.del(`otp-limit:cooldown:${identifier}:${ip}`);
    await client.decr(`otp-limit:ip-sends:${ip}`);
    await client.decr(`otp-limit:daily:${identifier}:${ip}`);
    await client.decr(`otp-limit:daily:${identifier}`);
  }

  async storeOtp(identifier: string, otp: string): Promise<void> {
    await this.redisService.set(
      `otp:${identifier}`,
      JSON.stringify({ otp }),
      OtpService.OTP_EXPIRY_SECONDS,
    );
  }

  async verifyOtp(identifier: string, otp: string, ip = 'unknown'): Promise<OtpVerifyResult> {
    const client = this.redisService.getClient();
    if (!client) throw unavailable();
    const key = `otp:${identifier}`;
    const ipKey = `otp-limit:ip-attempts:${ip}`;
    const pairKey = `otp-limit:attempts:${identifier}:${ip}`;
    const attemptsKey = `otp-limit:attempts:${identifier}`;
    const window = OtpService.ATTEMPT_WINDOW_SECONDS;

    // Count the guess first, atomically. Only then look at the code. The
    // per-IP buckets lock only the caller's IP and leave the code in place.
    if (
      (await incrWithTtl(client, ipKey, window)) > OtpService.IP_MAX_ATTEMPTS ||
      (await incrWithTtl(client, pairKey, window)) > OtpService.MAX_ATTEMPTS
    ) {
      this.logger.warn(`OTP locked for ${identifier} from ${ip}`);
      return 'blocked';
    }
    const attempts = await incrWithTtl(client, attemptsKey, window);
    if (attempts > OtpService.MAX_ATTEMPTS_TOTAL) {
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
    await client.del(pairKey);
    await client.decr(ipKey); // the IP bucket counts wrong guesses only
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

function unavailable(): HttpException {
  return new HttpException(
    'Sign-in codes are briefly unavailable. Please try again in a minute.',
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

function tooMany(message: string): HttpException {
  return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
