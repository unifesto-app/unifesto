import { createHmac, createSign, generateKeyPairSync } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MessageDeliveryStatus } from '@prisma/client';
import { EmailService } from './email.service';
import {
  applyEmailEvent,
  resendEvent,
  sesEvent,
  SnsMessage,
  verifySnsSignature,
  verifySvixSignature,
} from './email-webhooks';

describe('SNS signature (SES webhook)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const getCert = jest.fn(async () => pem);

  const sign = (m: Omit<SnsMessage, 'Signature'>): SnsMessage => {
    const str = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
      .filter((k) => (m as any)[k] !== undefined)
      .map((k) => `${k}\n${(m as any)[k]}\n`)
      .join('');
    return { ...m, Signature: createSign('RSA-SHA256').update(str).sign(privateKey, 'base64') };
  };
  const base = {
    Type: 'Notification',
    MessageId: 'm1',
    TopicArn: 'arn:aws:sns:ap-south-1:123:ses',
    Message: JSON.stringify({ notificationType: 'Delivery', mail: { messageId: 'ses-1' } }),
    Timestamp: '2026-10-19T00:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: 'https://sns.ap-south-1.amazonaws.com/SimpleNotificationService-abc.pem',
  };

  it('accepts a valid signature', async () => {
    await expect(verifySnsSignature(sign(base), getCert)).resolves.toBe(true);
  });

  it('rejects a tampered message', async () => {
    const m = sign(base);
    await expect(verifySnsSignature({ ...m, Message: m.Message.replace('Delivery', 'Bounce') }, getCert)).resolves.toBe(false);
  });

  it('rejects a cert URL off an SNS host or not https', async () => {
    for (const url of [
      'https://evil.example.com/SimpleNotificationService-abc.pem',
      'https://sns.ap-south-1.amazonaws.com.evil.com/x.pem',
      'http://sns.ap-south-1.amazonaws.com/x.pem',
    ]) {
      const m = sign({ ...base, SigningCertURL: url });
      await expect(verifySnsSignature(m, getCert)).resolves.toBe(false);
    }
    expect(getCert).not.toHaveBeenCalledWith(expect.stringContaining('evil'));
  });
});

describe('Svix signature (Resend webhook)', () => {
  const secret = 'whsec_' + Buffer.from('a-very-secret-key').toString('base64');
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're-1' } });
  const now = 1_760_000_000;
  const sig = (ts: number, raw = body) =>
    'v1,' + createHmac('sha256', Buffer.from('a-very-secret-key')).update(`msg_1.${ts}.${raw}`).digest('base64');

  it('accepts a valid signature (also among rotated ones)', () => {
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: `v1,AAAA ${sig(now)}` }, body, now)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(now), signature: sig(now) }, body.replace('delivered', 'bounced'), now)).toBe(false);
  });

  it('rejects a timestamp older than 5 minutes', () => {
    const old = now - 301;
    expect(verifySvixSignature(secret, { id: 'msg_1', timestamp: String(old), signature: sig(old) }, body, now)).toBe(false);
  });
});

describe('provider status mapping', () => {
  const db = () => ({
    messageDelivery: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    emailSuppression: { upsert: jest.fn().mockResolvedValue({}) },
  });

  it('SES delivery moves the row with that providerMessageId to DELIVERED', async () => {
    const d = db();
    await applyEmailEvent(d as any, 'ses', sesEvent({ notificationType: 'Delivery', mail: { messageId: 'ses-1' } })!);
    expect(d.messageDelivery.updateMany).toHaveBeenCalledWith({
      where: { channel: 'EMAIL', providerMessageId: 'ses-1', status: { in: ['QUEUED', 'SENT'] } },
      data: { status: 'DELIVERED', deliveredAt: expect.any(Date) },
    });
    expect(d.emailSuppression.upsert).not.toHaveBeenCalled();
  });

  it('SES permanent bounce fails the row and suppresses the address; transient is ignored', async () => {
    const d = db();
    const n = (bounceType: string) => ({
      notificationType: 'Bounce',
      mail: { messageId: 'ses-2' },
      bounce: { bounceType, bouncedRecipients: [{ emailAddress: 'Gone@Example.com', diagnosticCode: '550 no such user' }] },
    });
    expect(sesEvent(n('Transient'))).toBeNull();
    await applyEmailEvent(d as any, 'ses', sesEvent(n('Permanent'))!);
    expect(d.messageDelivery.updateMany).toHaveBeenCalledWith({
      where: { channel: 'EMAIL', providerMessageId: 'ses-2', status: { in: ['QUEUED', 'SENT', 'DELIVERED'] } },
      data: { status: 'FAILED', error: 'Bounced: 550 no such user' },
    });
    expect(d.emailSuppression.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { address: 'gone@example.com' }, create: expect.objectContaining({ reason: 'BOUNCE', source: 'ses' }) }),
    );
  });

  it('Resend complaint suppresses and keeps the status; opened -> OPENED', async () => {
    const d = db();
    await applyEmailEvent(d as any, 'resend', resendEvent({ type: 'email.complained', data: { email_id: 're-1', to: ['x@y.co'] } })!);
    expect(d.messageDelivery.updateMany).toHaveBeenCalledWith({
      where: { channel: 'EMAIL', providerMessageId: 're-1' },
      data: { error: 'Complaint' },
    });
    expect(d.emailSuppression.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ reason: 'COMPLAINT' }) }));

    await applyEmailEvent(d as any, 'resend', resendEvent({ type: 'email.opened', data: { email_id: 're-1' } })!);
    expect(d.messageDelivery.updateMany).toHaveBeenLastCalledWith({
      where: { channel: 'EMAIL', providerMessageId: 're-1', status: { in: ['QUEUED', 'SENT', 'DELIVERED'] } },
      data: { status: 'OPENED', openedAt: expect.any(Date) },
    });
  });
});

describe('EmailService suppression at the transport', () => {
  const config = { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService;
  const build = () => {
    const prisma: any = {
      emailSuppression: { findMany: jest.fn().mockResolvedValue([{ address: 'gone@example.com' }]) },
      messageDelivery: { create: jest.fn().mockResolvedValue({}), update: jest.fn(), updateMany: jest.fn() },
    };
    const service = new EmailService(config, prisma) as any;
    service.sendViaResend = jest.fn().mockResolvedValue({ id: 're-1' });
    service.sendViaSES = jest.fn().mockResolvedValue({ id: 'ses-1' });
    return { prisma, service };
  };

  it('blocks a suppressed address and logs SUPPRESSED', async () => {
    const { prisma, service } = build();
    const res = await service.sendRawEmailTracked('Gone@Example.com', 'Hi', '<p>Hi</p>');
    expect(res).toEqual({ ok: false, id: null, error: 'suppressed' });
    expect(service.sendViaResend).not.toHaveBeenCalled();
    expect(prisma.messageDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: MessageDeliveryStatus.SUPPRESSED, recipient: 'Gone@Example.com', provider: 'resend' }),
    });
  });

  it('still sends sign-in codes to a suppressed address', async () => {
    const { prisma, service } = build();
    await service.sendOtpEmail('gone@example.com', '123456');
    expect(service.sendViaSES).toHaveBeenCalled();
    expect(prisma.emailSuppression.findMany).not.toHaveBeenCalled();
  });

  it('campaign send drops suppressed addresses from a recipient list', async () => {
    const { service } = build();
    await service.sendCustomCampaignEmail({ to: ['gone@example.com', 'ok@example.com'], subject: 'S', html: 'h', campaignId: 'c' });
    expect(service.sendViaSES).toHaveBeenCalledWith(['ok@example.com'], 'S', 'h');
  });
});
