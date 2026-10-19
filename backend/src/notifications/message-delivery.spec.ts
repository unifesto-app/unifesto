import { Prisma } from '@prisma/client';
import { RETRY_BACKOFF_MS, isRetryableAxiosError, isTransientStatus, trackedSend } from './message-delivery';

const meta = { channel: 'EMAIL' as const, provider: 'resend' as const, label: 'Hi', recipient: 'a@b.co', kind: 'k' };
const p2002 = () => new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' });

const db = () => ({
  messageDelivery: {
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

describe('trackedSend (C3 delivery log)', () => {
  const saved = [...RETRY_BACKOFF_MS];
  beforeAll(() => RETRY_BACKOFF_MS.fill(0));
  afterAll(() => RETRY_BACKOFF_MS.splice(0, RETRY_BACKOFF_MS.length, ...saved));

  it('logs a SENT row on success', async () => {
    const d = db();
    const res = await trackedSend(d as any, meta, async () => ({ id: 'm1' }));
    expect(res).toEqual({ ok: true, id: 'm1', error: undefined });
    expect(d.messageDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ channel: 'EMAIL', recipient: 'a@b.co', status: 'SENT', providerMessageId: 'm1', attempts: 1 }),
    });
  });

  it('logs FAILED and does not retry a 4xx', async () => {
    const d = db();
    const attempt = jest.fn().mockResolvedValue({ id: null, error: '422: bad', retryable: false });
    const res = await trackedSend(d as any, meta, attempt);
    expect(res.ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(d.messageDelivery.create.mock.calls[0][0].data).toMatchObject({ status: 'FAILED', error: '422: bad', attempts: 1 });
  });

  it('never retries a thrown error (it may be a timeout)', async () => {
    const attempt = jest.fn().mockRejectedValue(new Error('timeout of 15000ms exceeded'));
    expect((await trackedSend(db() as any, meta, attempt)).ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries retryable failures up to 2 extra times', async () => {
    const d = db();
    const attempt = jest
      .fn()
      .mockResolvedValueOnce({ id: null, error: '503', retryable: true })
      .mockResolvedValueOnce({ id: null, error: '429', retryable: true })
      .mockResolvedValueOnce({ id: 'm3' });
    const res = await trackedSend(d as any, meta, attempt);
    expect(res.ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(d.messageDelivery.create.mock.calls[0][0].data).toMatchObject({ status: 'SENT', attempts: 3 });

    const always = jest.fn().mockResolvedValue({ id: null, error: 'timeout', retryable: true });
    expect((await trackedSend(d as any, meta, always)).ok).toBe(false);
    expect(always).toHaveBeenCalledTimes(3);
  });

  it('dedup: claims first, then updates the claimed row', async () => {
    const d = db();
    await trackedSend(d as any, { ...meta, dedupKey: 'k1' }, async () => ({ id: 'm1' }));
    expect(d.messageDelivery.create.mock.calls[0][0].data).toMatchObject({ status: 'QUEUED', dedupKey: 'k1' });
    expect(d.messageDelivery.update).toHaveBeenCalledWith({
      where: { dedupKey: 'k1' },
      data: expect.objectContaining({ status: 'SENT', providerMessageId: 'm1' }),
    });
  });

  it('dedup: skips when the key is already sent or in flight (race loser)', async () => {
    const d = db();
    d.messageDelivery.create.mockRejectedValue(p2002());
    d.messageDelivery.updateMany.mockResolvedValue({ count: 0 });
    const attempt = jest.fn();
    const res = await trackedSend(d as any, { ...meta, dedupKey: 'k1' }, attempt);
    expect(res).toEqual({ ok: true, id: null, deduped: true });
    expect(attempt).not.toHaveBeenCalled();
    // Only FAILED/SKIPPED or a stale QUEUED row can be re-claimed: never SUPPRESSED or sent.
    const where = d.messageDelivery.updateMany.mock.calls[0][0].where;
    expect(where.OR[0]).toEqual({ status: { in: ['FAILED', 'SKIPPED'] } });
    expect(where.OR[1].status).toBe('QUEUED');
  });

  it('dedup: re-sends when the earlier attempt FAILED', async () => {
    const d = db();
    d.messageDelivery.create.mockRejectedValue(p2002());
    d.messageDelivery.updateMany.mockResolvedValue({ count: 1 });
    const res = await trackedSend(d as any, { ...meta, dedupKey: 'k1' }, async () => ({ id: 'm2' }));
    expect(res.ok).toBe(true);
    expect(d.messageDelivery.update).toHaveBeenCalled();
  });

  it('never throws when the log itself fails; the message still goes', async () => {
    const d = db();
    d.messageDelivery.create.mockRejectedValue(new Error('db down'));
    const attempt = jest.fn().mockResolvedValue({ id: 'm1' });
    await expect(trackedSend(d as any, { ...meta, dedupKey: 'k1' }, attempt)).resolves.toMatchObject({ ok: true });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('sends with retries but no log when there is no db', async () => {
    await expect(trackedSend(undefined, meta, async () => ({ id: 'm1' }))).resolves.toMatchObject({ ok: true });
  });

  it('classifies statuses: 429/5xx retry, unknown (timeout) and other 4xx never', () => {
    expect([429, 500, 503].map((s) => isTransientStatus(s))).toEqual([true, true, true]);
    expect([null, undefined, 400, 404, 422].map((s) => isTransientStatus(s))).toEqual([false, false, false, false, false]);
  });

  it('WhatsApp (no idempotency key): retries only 429 and never-connected errors', () => {
    const http = (status: number) => ({ response: { status } });
    const net = (code: string) => ({ code });
    expect(isRetryableAxiosError(http(429), false)).toBe(true);
    expect(isRetryableAxiosError(http(503), false)).toBe(false);
    expect(isRetryableAxiosError(http(400), false)).toBe(false);
    for (const c of ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']) expect(isRetryableAxiosError(net(c), false)).toBe(true);
    for (const c of ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ERR_CANCELED']) expect(isRetryableAxiosError(net(c), false)).toBe(false);
    // With an idempotency key (OneSignal) a 5xx is safe to retry.
    expect(isRetryableAxiosError(http(503), true)).toBe(true);
  });
});
