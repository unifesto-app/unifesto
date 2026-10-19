import { Prisma } from '@prisma/client';
import { RETRY_BACKOFF_MS, isTransientStatus, trackedSend } from './message-delivery';

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

  it('retries transient failures (and throws) up to 2 extra times', async () => {
    const d = db();
    const attempt = jest
      .fn()
      .mockResolvedValueOnce({ id: null, error: '503', retryable: true })
      .mockRejectedValueOnce(new Error('ECONNRESET'))
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
    // Only FAILED/SKIPPED/SUPPRESSED or a stale QUEUED row can be re-claimed.
    const where = d.messageDelivery.updateMany.mock.calls[0][0].where;
    expect(where.OR[0].status.notIn).toEqual(['SENT', 'DELIVERED', 'OPENED', 'QUEUED']);
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

  it('classifies transient statuses', () => {
    expect([null, undefined, 429, 500, 503].map(isTransientStatus)).toEqual([true, true, true, true, true]);
    expect([400, 401, 404, 422].map(isTransientStatus)).toEqual([false, false, false, false]);
  });
});
