import axios from 'axios';
import { UptimeRobotService, monitorStatus, parseRatios, toMonitor } from './uptime-robot.service';

jest.mock('axios');
const mocked = axios as jest.Mocked<typeof axios>;

describe('UptimeRobot mapping', () => {
  it('maps v2 status codes', () => {
    expect([2, 8, 9, 0, 1, 'x'].map(monitorStatus)).toEqual(['up', 'degraded', 'down', 'paused', 'unknown', 'unknown']);
  });

  it('parses custom uptime ratios', () => {
    expect(parseRatios('99.998-100-99.9')).toEqual([99.998, 100, 99.9]);
    expect(parseRatios(undefined)).toEqual([]);
  });

  it('maps a monitor with its latest downtime', () => {
    const m = toMonitor({
      id: 7,
      friendly_name: 'API',
      url: 'https://api.unifesto.app/health',
      status: 2,
      custom_uptime_ratio: '100-99.95-99.9',
      average_response_time: '231.6',
      logs: [
        { type: 2, datetime: 1759000000, duration: 3600 },
        { type: 1, datetime: 1758990000, duration: 120, reason: { code: '333333', detail: 'Connection Timeout' } },
      ],
    });
    expect(m).toEqual({
      id: 7,
      name: 'API',
      url: 'https://api.unifesto.app/health',
      status: 'up',
      uptime: { day: 100, week: 99.95, month: 99.9 },
      responseMs: 232,
      lastDown: { at: new Date(1758990000 * 1000).toISOString(), durationSec: 120, reason: 'Connection Timeout' },
    });
  });
});

describe('UptimeRobotService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.resetAllMocks();
  });

  it('reports not configured without a key, and never calls out', async () => {
    delete process.env.UPTIMEROBOT_API_KEY;
    await expect(new UptimeRobotService().getStatus()).resolves.toMatchObject({ configured: false, monitors: [] });
    expect(mocked.post).not.toHaveBeenCalled();
  });

  it('caches for a minute and keeps the last reading when UptimeRobot is unreachable', async () => {
    process.env.UPTIMEROBOT_API_KEY = 'ur-key';
    const svc = new UptimeRobotService();
    mocked.post.mockResolvedValueOnce({ data: { stat: 'ok', monitors: [{ id: 1, friendly_name: 'Web', status: 9 }] } });
    const first = await svc.getStatus();
    expect(first.monitors[0].status).toBe('down');
    await svc.getStatus();
    expect(mocked.post).toHaveBeenCalledTimes(1);

    (svc as any).cache.at = 0; // expire
    mocked.post.mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const stale = await svc.getStatus();
    expect(stale.monitors).toHaveLength(1);
    expect(stale.error).toMatch(/last reading/);
  });

  it('surfaces an API error (bad key) without throwing', async () => {
    process.env.UPTIMEROBOT_API_KEY = 'bad';
    mocked.post.mockResolvedValueOnce({ data: { stat: 'fail', error: { type: 'invalid_parameter', message: 'api_key is invalid.' } } });
    await expect(new UptimeRobotService().getStatus()).resolves.toMatchObject({ configured: true, error: 'api_key is invalid.' });
  });
});
