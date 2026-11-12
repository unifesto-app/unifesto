import { createHash, randomBytes } from 'crypto';

/**
 * K22 registration API keys: "uf_live_" + 32 random bytes. Only the SHA-256 is
 * stored (a 256-bit random key needs no slow hash); the first 12 characters
 * are kept so organisers can tell keys apart.
 */
export const KEY_PREFIX = 'uf_live_';

export const hashKey = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function generateKey(): { key: string; prefix: string; hash: string } {
  const key = KEY_PREFIX + randomBytes(32).toString('base64url');
  return { key, prefix: key.slice(0, 12), hash: hashKey(key) };
}

/** "Bearer uf_live_…" → the key, or null for anything else. */
export function bearerKey(header: string | undefined): string | null {
  const raw = /^Bearer\s+(\S+)$/i.exec(header ?? '')?.[1];
  return raw && raw.startsWith(KEY_PREFIX) && raw.length <= 100 ? raw : null;
}
