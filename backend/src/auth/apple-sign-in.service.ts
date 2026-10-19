import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { hmacSecret } from '../common/secrets';

const APPLE = 'https://appleid.apple.com';

/**
 * Sign in with Apple server calls (O17, App Store 5.1.1(v)). At sign-in the
 * one-time authorization code is swapped for a refresh token, stored
 * encrypted; account deletion revokes it so the app drops off the user's
 * "Apps using Apple ID" list.
 *
 * Needs APPLE_CLIENT_ID (the bundle id, also the identity token audience),
 * APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the .p8, `\n` escapes ok).
 * The token is AES-256-GCM encrypted with APPLE_TOKEN_ENCRYPTION_KEY, or a key
 * derived from JWT_SECRET when unset (rotating JWT_SECRET then makes stored
 * tokens unrevocable; deletion reports that on the PRIVACY case).
 */
@Injectable()
export class AppleSignInService {
  constructor(private readonly config: ConfigService) {}

  /** Encrypted refresh token for this code, or null when Apple isn't configured. */
  async exchangeCode(code: string): Promise<string | null> {
    const clientSecret = this.clientSecret();
    if (!clientSecret) return null;
    const body = await this.post('/auth/token', {
      client_id: this.config.get<string>('APPLE_CLIENT_ID')!,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    const { refresh_token } = JSON.parse(body) as { refresh_token?: string };
    if (!refresh_token) throw new Error('Apple token response had no refresh_token');
    return this.encrypt(refresh_token);
  }

  /** Revoke a stored (encrypted) refresh token. Throws on any failure. */
  async revoke(encrypted: string): Promise<void> {
    const clientSecret = this.clientSecret();
    if (!clientSecret) throw new Error('Sign in with Apple is not configured');
    await this.post('/auth/revoke', {
      client_id: this.config.get<string>('APPLE_CLIENT_ID')!,
      client_secret: clientSecret,
      token: this.decrypt(encrypted),
      token_type_hint: 'refresh_token',
    });
  }

  private async post(path: string, form: Record<string, string>): Promise<string> {
    const res = await fetch(`${APPLE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(5000),
    });
    const text = await res.text();
    // Apple's error body is `{"error":"invalid_grant"}`, never a token.
    if (!res.ok) throw new Error(`Apple ${path} ${res.status}: ${text.slice(0, 200)}`);
    return text;
  }

  /** ES256 JWT Apple takes as client_secret; short-lived, minted per call. */
  private clientSecret(): string | null {
    const get = (k: string) => this.config.get<string>(k);
    const [clientId, teamId, keyId, key] = ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'].map(get);
    if (!clientId || !teamId || !keyId || !key) return null;
    return jwt.sign({}, key.replace(/\\n/g, '\n'), {
      algorithm: 'ES256',
      keyid: keyId,
      issuer: teamId,
      subject: clientId,
      audience: APPLE,
      expiresIn: '5m',
    });
  }

  private key(): Buffer {
    const secret = hmacSecret('APPLE_TOKEN_ENCRYPTION_KEY', 'apple-refresh-token', (k) => this.config.get<string>(k));
    return createHash('sha256').update(secret).digest();
  }

  /** base64(iv | tag | ciphertext) */
  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }

  private decrypt(stored: string): string {
    const buf = Buffer.from(stored, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
  }
}
