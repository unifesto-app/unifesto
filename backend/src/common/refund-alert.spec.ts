jest.mock('./observability', () => ({ reportError: jest.fn() }));
import { reportError } from './observability';
import { noteRefundFailure, REFUND_ALERT_AFTER, runRefundRetry } from './refund-alert';

describe('auto-refund alerting (J2)', () => {
  beforeEach(() => (reportError as jest.Mock).mockClear());

  it(`reports to Sentry from the ${REFUND_ALERT_AFTER}rd failed try on`, async () => {
    let n = 0;
    const client = { incr: jest.fn(async () => ++n), expire: jest.fn(async () => 1) };
    const redis = { getClient: () => client } as any;
    for (let i = 0; i < REFUND_ALERT_AFTER - 1; i++) await noteRefundFailure(redis, 'auto:reg:r1', new Error('x'));
    expect(reportError).not.toHaveBeenCalled();
    await noteRefundFailure(redis, 'auto:reg:r1', new Error('x'));
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { refund: 'auto:reg:r1', attempts: '3' });
    expect(client.expire).toHaveBeenCalledTimes(1);
  });

  it('reports every failure when Redis is down', async () => {
    await noteRefundFailure({ getClient: () => null } as any, 'auto:stay:b1', new Error('x'));
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('the retry cron runs under a per-kind cross-replica lock', async () => {
    const runExclusive = jest.fn(async (_k: string, _t: number, task: () => Promise<void>) => (await task(), true));
    const task = jest.fn(async () => undefined);
    await runRefundRetry({ runExclusive } as any, 'registration', task);
    expect(runExclusive).toHaveBeenCalledWith('cron:refundRetry:registration', 14 * 60, task);
    expect(task).toHaveBeenCalled();
  });
});
