import type { ThrottlerStorage } from '@nestjs/throttler';
import { FailOpenThrottlerStorage } from './fail-open-throttler.storage';
import { isInternalRequest } from '../guards/user-aware-throttler.guard';

const record = {
  totalHits: 301,
  timeToExpire: 60,
  isBlocked: true,
  timeToBlockExpire: 60,
};

const store = (increment: ThrottlerStorage['increment']) =>
  new FailOpenThrottlerStorage({ increment }, 50);

describe('FailOpenThrottlerStorage (S18)', () => {
  it('passes the real verdict through when Redis answers', async () => {
    const s = store(jest.fn().mockResolvedValue(record));
    await expect(s.increment('k', 60_000, 300, 0, 'default')).resolves.toBe(
      record,
    );
  });

  it('lets the request through when Redis errors', async () => {
    const s = store(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const r = await s.increment('k', 60_000, 300, 0, 'default');
    expect(r.isBlocked).toBe(false);
    expect(r.totalHits).toBe(0);
  });

  it('lets the request through when Redis never answers', async () => {
    const s = store(() => new Promise(() => {}));
    const r = await s.increment('k', 60_000, 300, 0, 'default');
    expect(r.isBlocked).toBe(false);
  });
});

describe('isInternalRequest (S19)', () => {
  it('accepts only the exact configured key', () => {
    expect(isInternalRequest('s3cret', 's3cret')).toBe(true);
    expect(isInternalRequest('s3cret-x', 's3cret')).toBe(false);
    expect(isInternalRequest('', 's3cret')).toBe(false);
    expect(isInternalRequest(['s3cret'], 's3cret')).toBe(false);
  });

  it('never skips throttling when no key is configured', () => {
    expect(isInternalRequest('anything', undefined)).toBe(false);
    expect(isInternalRequest('', '')).toBe(false);
  });
});
