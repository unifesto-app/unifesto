const captureException = jest.fn();
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  captureException,
  withScope: (fn: (scope: { setTag: () => void }) => void) =>
    fn({ setTag: jest.fn() }),
}));

import { initSentry, reportJobFailure } from './observability';

describe('reportJobFailure', () => {
  beforeAll(() => {
    process.env.SENTRY_DSN = 'https://key@example.invalid/1';
    initSentry();
  });
  afterAll(() => delete process.env.SENTRY_DSN);
  beforeEach(() => captureException.mockClear());

  const job = (attemptsMade: number, attempts?: number) => ({
    id: '1',
    name: 'send',
    attemptsMade,
    opts: { attempts },
  });

  it('stays quiet while retries are left', () => {
    reportJobFailure('q', job(1, 3), new Error('blip'));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports the last attempt', () => {
    reportJobFailure('q', job(3, 3), new Error('dead'));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('reports a job with no retries configured, or no job at all', () => {
    reportJobFailure('q', job(1), new Error('a'));
    reportJobFailure('q', undefined, new Error('b'));
    expect(captureException).toHaveBeenCalledTimes(2);
  });
});
