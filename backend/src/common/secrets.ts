import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';

type Lookup = (key: string) => string | undefined;
const fromEnv: Lookup = (k) => process.env[k];

/**
 * Secret for one HMAC purpose (S31): the dedicated `envKey` when set, else a
 * key derived from JWT_SECRET and bound to `purpose`, so a leak of one never
 * forges the other (or a JWT). Never a hardcoded fallback.
 */
export function hmacSecret(envKey: string, purpose: string, get: Lookup = fromEnv): string {
  const own = get(envKey);
  if (own) return own;
  const jwt = get('JWT_SECRET');
  if (!jwt) throw new Error(`${envKey} or JWT_SECRET must be set`);
  return createHmac('sha256', jwt).update(`unifesto:${purpose}`).digest('hex');
}

const aesKey = (envKey: string, purpose: string, get: Lookup) =>
  createHash('sha256').update(hmacSecret(envKey, purpose, get)).digest();

/**
 * A secret we must be able to read back (a webhook signing secret, K23), kept
 * encrypted at rest: AES-256-GCM, stored as base64(iv | tag | ciphertext).
 * Same scheme as Apple refresh tokens (auth/apple-sign-in.service.ts).
 */
export function sealSecret(plain: string, envKey: string, purpose: string, get: Lookup = fromEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey(envKey, purpose, get), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function openSecret(stored: string, envKey: string, purpose: string, get: Lookup = fromEnv): string {
  const buf = Buffer.from(stored, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', aesKey(envKey, purpose, get), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}
