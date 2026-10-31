import axios from 'axios';
import { SentryIssuesService, toIssue } from './sentry-issues.service';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

const raw = {
  id: '6123',
  shortId: 'UNIFESTO-BACKEND-1A',
  title: 'TypeError: Cannot read properties of undefined',
  culprit: 'BookingsService.create',
  permalink: 'https://unifesto.sentry.io/issues/6123/',
  level: 'error',
  count: '42',
  userCount: 3,
  firstSeen: '2026-10-30T10:00:00Z',
  lastSeen: '2026-10-31T09:00:00Z',
  project: { id: '1', slug: 'unifesto-backend', name: 'unifesto-backend' },
};

describe('Sentry issue mapping', () => {
  it('maps an organization-issues entry', () => {
    expect(toIssue(raw)).toEqual({
      id: '6123',
      shortId: 'UNIFESTO-BACKEND-1A',
      title: 'TypeError: Cannot read properties of undefined',
      culprit: 'BookingsService.create',
      project: 'backend',
      level: 'error',
      count: 42,
      users: 3,
      firstSeen: '2026-10-30T10:00:00Z',
      lastSeen: '2026-10-31T09:00:00Z',
      url: 'https://unifesto.sentry.io/issues/6123/',
    });
  });

  it('tolerates missing fields', () => {
    expect(toIssue({ id: 1 })).toMatchObject({ title: 'Untitled issue', culprit: null, project: 'unknown', count: 0 });
  });
});

describe('SentryIssuesService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.resetAllMocks();
  });

  it('reports not configured without a token, and never calls out', async () => {
    delete process.env.SENTRY_API_TOKEN;
    await expect(new SentryIssuesService().getIssues()).resolves.toMatchObject({ configured: false, issues: [] });
    expect(mocked.get).not.toHaveBeenCalled();
  });

  it('reads the total from X-Hits, caches for a minute, and keeps the last reading when Sentry is down', async () => {
    process.env.SENTRY_API_TOKEN = 'sntryu_x';
    const svc = new SentryIssuesService();
    mocked.get.mockResolvedValueOnce({ data: [raw], headers: { 'x-hits': '17' } });
    const first = await svc.getIssues();
    expect(first).toMatchObject({ configured: true, error: null, total: 17 });
    expect(first.issues[0].project).toBe('backend');
    await svc.getIssues();
    expect(mocked.get).toHaveBeenCalledTimes(1);

    (svc as any).cache.at = 0; // expire
    mocked.get.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const stale = await svc.getIssues();
    expect(stale.issues).toHaveLength(1);
    expect(stale.error).toMatch(/last reading/);
  });

  it('names a rejected token instead of showing a stale list', async () => {
    process.env.SENTRY_API_TOKEN = 'bad';
    mocked.get.mockRejectedValueOnce({ response: { status: 401 } });
    await expect(new SentryIssuesService().getIssues()).resolves.toMatchObject({
      configured: true,
      error: expect.stringMatching(/event:read/),
      issues: [],
    });
  });

  describe('resolve', () => {
    it('PUTs status resolved and drops the cache so the next read refetches', async () => {
      process.env.SENTRY_API_TOKEN = 'sntryu_x';
      const svc = new SentryIssuesService();
      mocked.get.mockResolvedValue({ data: [raw], headers: {} });
      await svc.getIssues();
      mocked.put.mockResolvedValueOnce({ data: { status: 'resolved' } });

      await expect(svc.resolve('6123')).resolves.toEqual({ id: '6123', status: 'resolved' });
      expect(mocked.put).toHaveBeenCalledWith(
        'https://us.sentry.io/api/0/organizations/unifesto/issues/6123/',
        { status: 'resolved' },
        expect.objectContaining({ headers: { Authorization: 'Bearer sntryu_x' } }),
      );
      await svc.getIssues();
      expect(mocked.get).toHaveBeenCalledTimes(2);
    });

    it('refuses anything but a numeric id, without calling Sentry', async () => {
      process.env.SENTRY_API_TOKEN = 'sntryu_x';
      await expect(new SentryIssuesService().resolve('../../projects')).rejects.toThrow('Not a Sentry issue id');
      expect(mocked.put).not.toHaveBeenCalled();
    });

    it('throws when not connected, and names a token without event:write', async () => {
      delete process.env.SENTRY_API_TOKEN;
      await expect(new SentryIssuesService().resolve('1')).rejects.toThrow('Sentry isn’t connected');

      process.env.SENTRY_API_TOKEN = 'read-only';
      mocked.put.mockRejectedValueOnce({ response: { status: 403 } });
      await expect(new SentryIssuesService().resolve('1')).rejects.toThrow(/event:write/);
    });
  });
});
