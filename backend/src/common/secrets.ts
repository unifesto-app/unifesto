import { createHmac } from 'crypto';

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
