import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import * as http2 from 'http2';
import * as jwt from 'jsonwebtoken';
import { reportError } from '../common/observability';
import { AttemptResult, isRetryableAxiosError, isTransientStatus } from './message-delivery';

export interface PushMessage {
  title: string;
  body: string;
  /** deepLink, type, eventId…: what the app reads on tap. */
  data?: Record<string, unknown>;
}

/** An install on native push: iOS tokens are APNs, Android tokens are FCM. */
export interface DirectDevice {
  userId: string;
  token: string;
  platform: string;
  sandbox: boolean;
}

export interface DirectResult extends AttemptResult {
  /** The token is gone for good (app uninstalled): delete the row. */
  dead?: boolean;
}

export type DirectProvider = 'apns' | 'fcm';

export const providerOf = (platform: string): DirectProvider => (platform === 'ios' ? 'apns' : 'fcm');

const APNS_PRODUCTION = 'https://api.push.apple.com';
const APNS_SANDBOX = 'https://api.sandbox.push.apple.com';
const APNS_TOPIC = 'com.unifesto.app';
// Apple refuses a token refreshed more than once per 20 min and expires it at 60.
const APNS_JWT_TTL_MS = 50 * 60 * 1000;
/** The channel the app creates for pushes (C14 must create one with this id). */
const ANDROID_CHANNEL = 'default';
const TIMEOUT_MS = 10_000;

const HOUR = 60 * 60 * 1000;
// ponytail: per-replica counters; with several replicas each alerts on its own share.
const ALERT_MIN_FAILURES = 10;
const ALERT_FAILURE_RATE = 0.2;

const parse = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

/**
 * Sends one push straight to Apple (APNs over HTTP/2) or Google (FCM HTTP v1),
 * replacing OneSignal for installs that report a native token (C12). The
 * payload matches what expo-notifications reads: iOS takes the app's data from
 * the `body` key; Android gets a data-only message with `title`, `message` and
 * `body` (the data as a JSON string), which the app presents itself.
 *
 * Needs APNS_KEY_P8 (`\n` escapes ok) + APNS_KEY_ID (+ APNS_TEAM_ID, else
 * APPLE_TEAM_ID) for iOS, FCM_SERVICE_ACCOUNT_JSON for Android. Never throws.
 */
@Injectable()
export class PushSender implements OnModuleDestroy {
  private readonly logger = new Logger(PushSender.name);
  private readonly sessions = new Map<string, http2.ClientHttp2Session>();
  private apnsJwt: { token: string; at: number } | null = null;
  private fcm: { auth: GoogleAuth; project: string } | null | undefined;
  private readonly health = new Map<DirectProvider, { since: number; sent: number; failed: number; alerted: boolean }>();

  isConfigured(): boolean {
    return !!this.apnsToken() || !!this.fcmClient();
  }

  async send(device: DirectDevice, msg: PushMessage): Promise<DirectResult> {
    const provider = providerOf(device.platform);
    let result: DirectResult;
    try {
      result = provider === 'apns' ? await this.apns(device, msg) : await this.sendFcm(device, msg);
    } catch (err: any) {
      result = { id: null, error: err?.message ?? String(err), retryable: isRetryableAxiosError(err, false) };
    }
    if (result.error !== 'not_configured') this.record(provider, !!result.id, result.error);
    return result;
  }

  onModuleDestroy() {
    for (const s of this.sessions.values()) s.close();
  }

  private async apns(d: DirectDevice, msg: PushMessage): Promise<DirectResult> {
    const bearer = this.apnsToken();
    if (!bearer) return { id: null, error: 'not_configured' };
    const payload = JSON.stringify({
      aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
      body: msg.data ?? {},
    });
    const res = await this.h2(d.sandbox ? APNS_SANDBOX : APNS_PRODUCTION, {
      ':method': 'POST',
      ':path': `/3/device/${d.token}`,
      authorization: `bearer ${bearer}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
    }, payload);
    if (res.status === 200) return { id: String(res.headers['apns-id'] ?? 'apns') };
    const reason = parse(res.body).reason ?? 'unknown';
    if (reason === 'ExpiredProviderToken') this.apnsJwt = null;
    return {
      id: null,
      error: `${res.status} ${reason}`,
      dead: res.status === 410,
      // No idempotency key at APNs: only a 429 (nothing went out) is retried.
      retryable: isTransientStatus(res.status, false),
    };
  }

  private async sendFcm(d: DirectDevice, msg: PushMessage): Promise<DirectResult> {
    const client = this.fcmClient();
    if (!client) return { id: null, error: 'not_configured' };
    const accessToken = await client.auth.getAccessToken();
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${client.project}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: d.token,
          // FCM data values must be strings.
          data: {
            title: msg.title,
            message: msg.body,
            body: JSON.stringify(msg.data ?? {}),
            channelId: ANDROID_CHANNEL,
          },
          android: { priority: 'HIGH' },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = parse(await res.text());
    if (res.ok) return { id: json.name ?? 'fcm' };
    const code: string =
      json.error?.details?.find((x: any) => x?.errorCode)?.errorCode ?? json.error?.status ?? 'unknown';
    return {
      id: null,
      error: `${res.status} ${code}`,
      dead: code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH',
      retryable: isTransientStatus(res.status, false),
    };
  }

  /** ES256 provider token, reused for 50 minutes as Apple asks. */
  private apnsToken(): string | null {
    const key = process.env.APNS_KEY_P8;
    const keyId = process.env.APNS_KEY_ID;
    const teamId = process.env.APNS_TEAM_ID || process.env.APPLE_TEAM_ID;
    if (!key || !keyId || !teamId) return null;
    if (this.apnsJwt && Date.now() - this.apnsJwt.at < APNS_JWT_TTL_MS) return this.apnsJwt.token;
    const token = jwt.sign({}, key.replace(/\\n/g, '\n'), { algorithm: 'ES256', keyid: keyId, issuer: teamId });
    this.apnsJwt = { token, at: Date.now() };
    return token;
  }

  /** GoogleAuth caches and refreshes the OAuth token itself. */
  private fcmClient(): { auth: GoogleAuth; project: string } | null {
    if (this.fcm !== undefined) return this.fcm;
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    const sa = raw ? parse(raw) : null;
    this.fcm =
      sa?.project_id && sa.client_email && sa.private_key
        ? {
            auth: new GoogleAuth({
              credentials: { client_email: sa.client_email, private_key: sa.private_key },
              projectId: sa.project_id,
              scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
            }),
            project: sa.project_id,
          }
        : null;
    return this.fcm;
  }

  /** One HTTP/2 connection per APNs host, reopened when it drops. */
  private h2(
    origin: string,
    headers: http2.OutgoingHttpHeaders,
    payload: string,
  ): Promise<{ status: number; headers: http2.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      let session = this.sessions.get(origin);
      if (!session || session.closed || session.destroyed) {
        const s = http2.connect(origin);
        const drop = () => this.sessions.get(origin) === s && this.sessions.delete(origin);
        s.on('error', drop);
        s.on('goaway', drop);
        s.on('close', drop);
        s.unref();
        this.sessions.set(origin, s);
        session = s;
      }
      const req = session.request(headers);
      let status = 0;
      let resHeaders: http2.IncomingHttpHeaders = {};
      let body = '';
      req.setTimeout(TIMEOUT_MS, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.setEncoding('utf8');
      req.on('response', (h) => {
        status = Number(h[':status']);
        resHeaders = h;
      });
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', () => resolve({ status, headers: resHeaders, body }));
      req.on('error', reject);
      // After 'end' this is a no-op; otherwise it was cancelled or the session died.
      req.on('close', () => reject(new Error('APNs request closed before a response')));
      req.end(payload);
    });
  }

  /**
   * Sentry alert once an hour when a provider fails more than 20% of sends: an
   * expired Apple key or a revoked service account fails every push, and with
   * OneSignal gone nothing else would show it.
   */
  private record(provider: DirectProvider, ok: boolean, error?: string) {
    const now = Date.now();
    let h = this.health.get(provider);
    if (!h || now - h.since > HOUR) {
      h = { since: now, sent: 0, failed: 0, alerted: false };
      this.health.set(provider, h);
    }
    if (ok) h.sent++;
    else h.failed++;
    if (!h.alerted && h.failed >= ALERT_MIN_FAILURES && h.failed / (h.sent + h.failed) > ALERT_FAILURE_RATE) {
      h.alerted = true;
      this.logger.error(`${provider} push failing: ${h.failed} of ${h.sent + h.failed} this hour, last: ${error}`);
      reportError(new Error(`${provider} push failing: ${error}`), { channel: 'push', provider }, ['push-health', provider]);
    }
  }
}
