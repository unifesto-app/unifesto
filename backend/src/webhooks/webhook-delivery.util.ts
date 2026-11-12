import { BadRequestException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { isBlockedAddress, safeLookup } from '../events/event-draft';

/** K23: what a space's webhook can hear about. */
export const WEBHOOK_TYPES = ['registration.confirmed', 'registration.cancelled', 'registration.checked_in'] as const;
export type WebhookType = (typeof WEBHOOK_TYPES)[number];

export const SECRET_PREFIX = 'whsec_';
export const newWebhookSecret = () => SECRET_PREFIX + randomBytes(32).toString('base64url');

/**
 * Signature over `id.timestamp.body` with the webhook's secret, hex HMAC-SHA256.
 * Receivers recompute it, compare in constant time, reject timestamps older
 * than five minutes and drop ids they've already seen.
 */
export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('hex');
}

export function webhookHeaders(secret: string, id: string, timestamp: number, body: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Unifesto-Webhooks/1',
    'Unifesto-Webhook-Id': id,
    'Unifesto-Webhook-Timestamp': String(timestamp),
    'Unifesto-Webhook-Signature': `v1=${signWebhook(secret, id, timestamp, body)}`,
  };
}

/**
 * Local testing only (a receiver on localhost): never in production, which
 * config validation refuses at boot.
 */
export const allowPrivateWebhooks = () => process.env.WEBHOOK_ALLOW_PRIVATE === '1' && process.env.NODE_ENV !== 'production';

/**
 * A webhook URL Unifesto may call: https on the default port, no credentials,
 * a public name. Checked on save and again on every send; the DNS answer is
 * checked at connect time too (safeLookup), so a name re-pointed at a private
 * address later still can't reach it.
 */
export function assertWebhookUrl(raw: string, allowPrivate = allowPrivateWebhooks()): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException('Enter the full webhook URL, starting with https://');
  }
  if (raw.length > 500) throw new BadRequestException('That webhook URL is too long');
  if (allowPrivate && url.protocol === 'http:') return url;
  if (url.protocol !== 'https:') throw new BadRequestException('The webhook URL must start with https://');
  if (url.username || url.password) throw new BadRequestException('The webhook URL cannot contain a username or password');
  if (url.port && url.port !== '443') throw new BadRequestException('The webhook URL must use the standard https port');
  if (allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host.includes('.') || /\.(localhost|local|lan|internal|home|corp|intranet)$/i.test(host) || (isIP(host) && isBlockedAddress(host))) {
    throw new BadRequestException('The webhook URL must be a public address');
  }
  return url;
}

export interface SendResult {
  ok: boolean;
  status: number | null;
  error: string | null;
  durationMs: number;
}

const TIMEOUT_MS = 5000;
/** We read this much of the answer at most, and keep none of it. */
const MAX_RESPONSE_BYTES = 4096;

/**
 * One POST. No redirects (a 3xx is a failure: following one could land on an
 * internal address), no proxy, a pinned safe DNS lookup, a 5 second limit and
 * a small response cap. Only the status, timing and an error code come back.
 */
export function sendWebhook(url: URL, headers: Record<string, string>, body: string): Promise<SendResult> {
  const started = Date.now();
  const lib = url.protocol === 'http:' ? http : https;
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: Omit<SendResult, 'durationMs'>) => {
      if (settled) return;
      settled = true;
      resolve({ ...r, durationMs: Date.now() - started });
    };
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
        lookup: allowPrivateWebhooks() ? undefined : safeLookup,
        timeout: TIMEOUT_MS,
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let read = 0;
        res.on('data', (chunk: Buffer) => {
          read += chunk.length;
          if (read > MAX_RESPONSE_BYTES) res.destroy();
        });
        const finish = () => done({ ok: status >= 200 && status < 300, status, error: status >= 200 && status < 300 ? null : `HTTP ${status}` });
        res.on('end', finish);
        res.on('close', finish);
        res.on('error', finish);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })));
    req.on('error', (err: NodeJS.ErrnoException) => done({ ok: false, status: null, error: (err.code ?? err.message).slice(0, 120) }));
    req.end(body);
  });
}
