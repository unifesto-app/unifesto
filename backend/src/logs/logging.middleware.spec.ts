import type { Request } from 'express';
import { loggedError, loggedPath, sampleWeight, shouldSkipLog } from './logging.middleware';

describe('loggedError', () => {
  it('drops the raw URL Nest echoes for unmatched routes', () => {
    expect(loggedError('GET', 'Cannot GET /groups/claim/abcdefabcdefabcdefabcdefabcdef?token=x')).toBe('Route not found');
  });
  it('keeps real error messages', () => {
    expect(loggedError('GET', 'Invalid or expired token')).toBe('Invalid or expired token');
    expect(loggedError('GET', undefined)).toBeNull();
  });
});

describe('shouldSkipLog', () => {
  it('skips healthchecks, preflights and the log viewer', () => {
    expect(shouldSkipLog('GET', '/')).toBe(true);
    expect(shouldSkipLog('HEAD', '/')).toBe(true);
    expect(shouldSkipLog('GET', '/health')).toBe(true);
    expect(shouldSkipLog('OPTIONS', '/events')).toBe(true);
    expect(shouldSkipLog('GET', '/admin/logs/stats')).toBe(true);
  });
  it('keeps real traffic', () => {
    expect(shouldSkipLog('GET', '/events')).toBe(false);
    expect(shouldSkipLog('POST', '/')).toBe(false);
  });
});

// S27: no bearer tokens in stored paths; sampled 2xx GETs carry a weight.
describe('loggedPath', () => {
  const req = (r: Partial<Request> & { route?: { path: string } }) => r as Request;

  it('stores the route template, not the raw URL', () => {
    expect(
      loggedPath(req({ route: { path: '/groups/claim/:token' }, baseUrl: '', originalUrl: '/groups/claim/abcdefabcdefabcdefabcdefabcdef?x=1' })),
    ).toBe('/groups/claim/:token');
  });

  it('redacts long segments on unmatched routes', () => {
    expect(loggedPath(req({ originalUrl: '/nope/abcdefabcdefabcdefabcdefabcdef?t=1' }))).toBe('/nope/:redacted');
    expect(loggedPath(req({ originalUrl: '/events/short' }))).toBe('/events/short');
  });
});

describe('sampleWeight', () => {
  it('always keeps writes and errors', () => {
    expect(sampleWeight('POST', 200, 10, () => 0.99)).toBe(1);
    expect(sampleWeight('GET', 404, 10, () => 0.99)).toBe(1);
  });
  it('keeps 1-in-N successful GETs with weight N', () => {
    expect(sampleWeight('GET', 200, 10, () => 0.05)).toBe(10);
    expect(sampleWeight('GET', 200, 10, () => 0.5)).toBeNull();
    expect(sampleWeight('GET', 200, 1, () => 0.5)).toBe(1);
  });
});
