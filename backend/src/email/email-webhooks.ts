import { createHmac, createVerify, timingSafeEqual } from 'crypto';
import { EmailSuppressionReason, MessageChannel, PrismaClient } from '@prisma/client';
import { applyProviderEvent, ProviderEvent } from '../notifications/message-delivery';
import { suppressAddress } from './email-suppression';

/**
 * C5: provider delivery webhooks for email. Pure verification + mapping here;
 * EmailWebhooksController does the HTTP side.
 */

// ---------------------------------------------------------------------------
// SNS (SES notifications)
// ---------------------------------------------------------------------------

export interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Signature: string;
  SignatureVersion: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

/** An https URL on an SNS regional host (cert and SubscribeURL must be one). */
export function isSnsUrl(url: string | undefined, pathSuffix = ''): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      !u.port &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(u.hostname) &&
      u.pathname.endsWith(pathSuffix)
    );
  } catch {
    return false;
  }
}

/** The canonical string SNS signs (field order is fixed by AWS). */
function snsStringToSign(m: SnsMessage): string {
  const keys =
    m.Type === 'Notification'
      ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return keys
    .filter((k) => (m as any)[k] !== undefined)
    .map((k) => `${k}\n${(m as any)[k]}\n`)
    .join('');
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
  if (!res.ok) throw new Error(`cert fetch ${res.status}`);
  return res.text();
}

/**
 * Verify an SNS message signature (SignatureVersion 1 = SHA1, 2 = SHA256).
 * The cert must come from https://sns.<region>.amazonaws.com/...pem; it is
 * cached per URL. `getCert` is injectable for specs.
 */
export async function verifySnsSignature(
  m: SnsMessage,
  getCert: (url: string) => Promise<string> = fetchCert,
): Promise<boolean> {
  if (!m?.Signature || !isSnsUrl(m.SigningCertURL, '.pem')) return false;
  const algo = m.SignatureVersion === '1' ? 'RSA-SHA1' : m.SignatureVersion === '2' ? 'RSA-SHA256' : null;
  if (!algo) return false;
  try {
    let cert = certCache.get(m.SigningCertURL);
    if (!cert) {
      cert = await getCert(m.SigningCertURL);
      certCache.set(m.SigningCertURL, cert);
    }
    return createVerify(algo).update(snsStringToSign(m), 'utf8').verify(cert, m.Signature, 'base64');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Resend (Svix)
// ---------------------------------------------------------------------------

const SVIX_TOLERANCE_S = 5 * 60;

/** Verify Svix headers against the raw body with a `whsec_...` secret. */
export function verifySvixSignature(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: string,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > SVIX_TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  // Header: space-separated "v1,<base64>" entries (several during key rotation).
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// ---------------------------------------------------------------------------
// Normalised events
// ---------------------------------------------------------------------------

export interface EmailEvent {
  messageId: string;
  event: ProviderEvent;
  /** Addresses to suppress (permanent bounce / complaint only). */
  suppress?: { addresses: string[]; reason: EmailSuppressionReason; details: string };
  detail?: string;
}

/**
 * One SES notification (identity notifications use `notificationType`,
 * configuration-set event publishing uses `eventType`). Transient bounces
 * return null: SES retries those itself.
 */
export function sesEvent(n: any): EmailEvent | null {
  const type = n?.notificationType ?? n?.eventType;
  const messageId = n?.mail?.messageId;
  if (!messageId) return null;
  switch (type) {
    case 'Delivery':
      return { messageId, event: 'delivered' };
    case 'Open':
      return { messageId, event: 'opened' };
    case 'Bounce': {
      if (n.bounce?.bounceType !== 'Permanent') return null;
      const recips: any[] = n.bounce?.bouncedRecipients ?? [];
      const detail = `Bounced: ${recips.map((r) => r.diagnosticCode).filter(Boolean)[0] ?? n.bounce?.bounceSubType ?? 'permanent'}`;
      return {
        messageId,
        event: 'failed',
        detail,
        suppress: { addresses: recips.map((r) => r.emailAddress).filter(Boolean), reason: EmailSuppressionReason.BOUNCE, details: detail },
      };
    }
    case 'Complaint': {
      const detail = `Complaint${n.complaint?.complaintFeedbackType ? `: ${n.complaint.complaintFeedbackType}` : ''}`;
      return {
        messageId,
        event: 'complained',
        detail,
        suppress: {
          addresses: (n.complaint?.complainedRecipients ?? []).map((r: any) => r.emailAddress).filter(Boolean),
          reason: EmailSuppressionReason.COMPLAINT,
          details: detail,
        },
      };
    }
    default:
      return null;
  }
}

/** One Resend webhook event. */
export function resendEvent(body: any): EmailEvent | null {
  const messageId = body?.data?.email_id;
  if (!messageId) return null;
  const to: string[] = Array.isArray(body.data.to) ? body.data.to : body.data.to ? [body.data.to] : [];
  switch (body.type) {
    case 'email.delivered':
      return { messageId, event: 'delivered' };
    case 'email.opened':
      return { messageId, event: 'opened' };
    case 'email.failed':
      return { messageId, event: 'failed', detail: body.data.failed?.reason ?? 'failed' };
    case 'email.bounced': {
      const b = body.data.bounce ?? {};
      const detail = `Bounced: ${b.message ?? b.subType ?? 'permanent'}`;
      // Resend reports delays separately (email.delivery_delayed); still guard.
      if (b.type && b.type !== 'Permanent') return null;
      return { messageId, event: 'failed', detail, suppress: { addresses: to, reason: EmailSuppressionReason.BOUNCE, details: detail } };
    }
    case 'email.complained':
      return {
        messageId,
        event: 'complained',
        detail: 'Complaint',
        suppress: { addresses: to, reason: EmailSuppressionReason.COMPLAINT, details: 'Complaint' },
      };
    default:
      return null;
  }
}

/** Apply one event: move the delivery row, suppress addresses. */
export async function applyEmailEvent(
  db: Pick<PrismaClient, 'messageDelivery' | 'emailSuppression'>,
  source: 'ses' | 'resend',
  ev: EmailEvent,
): Promise<void> {
  await applyProviderEvent(db, MessageChannel.EMAIL, ev.messageId, ev.event, ev.detail);
  for (const address of ev.suppress?.addresses ?? []) {
    await suppressAddress(db, address, ev.suppress!.reason, source, ev.suppress!.details);
  }
}
