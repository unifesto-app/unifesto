import { generateKeyPairSync } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { reportError } from '../common/observability';
import { PushSender } from './push-sender';

jest.mock('../common/observability', () => ({ reportError: jest.fn() }));

describe('PushSender (C12)', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const env = { ...process.env };
  const msg = { title: 'You’re in', body: 'Ticket ready', data: { deepLink: 'unifesto://tickets', type: 'registration' } };
  const ios = { userId: 'u', token: 'a'.repeat(64), platform: 'ios', sandbox: false };
  const android = { userId: 'u', token: 'fcm:tok_1', platform: 'android', sandbox: false };

  beforeEach(() => {
    process.env.APNS_KEY_P8 = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().replace(/\n/g, '\\n');
    process.env.APNS_KEY_ID = 'KEY123';
    process.env.APNS_TEAM_ID = 'TEAM42';
    process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'unifesto', client_email: 'x@y', private_key: 'k' });
    (reportError as jest.Mock).mockClear();
  });
  afterAll(() => {
    process.env = env;
  });

  const withApns = (status: number, body = '', headers: Record<string, string> = {}) => {
    const sender = new PushSender();
    const h2 = jest.spyOn(sender as any, 'h2').mockResolvedValue({ status, headers, body });
    return { sender, h2 };
  };

  it('APNs: the app data rides under `body` (where expo-notifications reads it), signed ES256', async () => {
    const { sender, h2 } = withApns(200, '', { 'apns-id': 'id-1' });
    await expect(sender.send({ ...ios, sandbox: true }, msg)).resolves.toEqual({ id: 'id-1' });

    const [origin, headers, payload] = h2.mock.calls[0] as [string, Record<string, string>, string];
    expect(origin).toBe('https://api.sandbox.push.apple.com');
    expect(headers[':path']).toBe(`/3/device/${ios.token}`);
    expect(headers['apns-topic']).toBe('com.unifesto.app');
    expect(JSON.parse(payload)).toEqual({
      aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
      body: msg.data,
    });
    const token = headers.authorization.replace('bearer ', '');
    expect(jwt.decode(token, { complete: true })).toMatchObject({
      header: { alg: 'ES256', kid: 'KEY123' },
      payload: { iss: 'TEAM42' },
    });
    // The provider token is reused, not re-signed per push.
    await sender.send(ios, msg);
    expect((h2.mock.calls[1][1] as any).authorization).toBe(headers.authorization);
    expect(h2.mock.calls[1][0]).toBe('https://api.push.apple.com');
  });

  it('APNs: 410 marks the token dead, 429 is retried, a bad token is neither', async () => {
    await expect(withApns(410, '{"reason":"Unregistered"}').sender.send(ios, msg)).resolves.toEqual({
      id: null, error: '410 Unregistered', dead: true, retryable: false,
    });
    await expect(withApns(429, '{"reason":"TooManyRequests"}').sender.send(ios, msg)).resolves.toMatchObject({ dead: false, retryable: true });
    await expect(withApns(400, '{"reason":"BadDeviceToken"}').sender.send(ios, msg)).resolves.toMatchObject({ dead: false, retryable: false });
  });

  describe('FCM', () => {
    const fetchMock = jest.fn();
    beforeEach(() => {
      fetchMock.mockReset();
      (global as any).fetch = fetchMock;
    });
    const withFcm = () => {
      const sender = new PushSender();
      jest.spyOn(sender as any, 'fcmClient').mockReturnValue({ auth: { getAccessToken: async () => 'oauth' }, project: 'unifesto' });
      return sender;
    };

    it('sends a data-only message in the shape expo-notifications presents', async () => {
      fetchMock.mockResolvedValue({ ok: true, text: async () => '{"name":"projects/unifesto/messages/1"}' });
      await expect(withFcm().send(android, msg)).resolves.toEqual({ id: 'projects/unifesto/messages/1' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://fcm.googleapis.com/v1/projects/unifesto/messages:send');
      expect(init.headers.Authorization).toBe('Bearer oauth');
      expect(JSON.parse(init.body)).toEqual({
        message: {
          token: android.token,
          data: { title: msg.title, message: msg.body, body: JSON.stringify(msg.data), channelId: 'default' },
          android: { priority: 'HIGH' },
        },
      });
    });

    it('UNREGISTERED marks the token dead', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
      });
      await expect(withFcm().send(android, msg)).resolves.toMatchObject({ id: null, error: '404 UNREGISTERED', dead: true });
    });
  });

  it('not configured: says so, and never counts toward the health alert', async () => {
    delete process.env.APNS_KEY_P8;
    const sender = new PushSender();
    await expect(sender.send(ios, msg)).resolves.toEqual({ id: null, error: 'not_configured' });
  });

  it('alerts Sentry once when a provider fails over 20% of sends in the hour', async () => {
    const { sender } = withApns(403, '{"reason":"InvalidProviderToken"}');
    for (let i = 0; i < 15; i++) await sender.send(ios, msg);
    expect(reportError).toHaveBeenCalledTimes(1);
    expect((reportError as jest.Mock).mock.calls[0][2]).toEqual(['push-health', 'apns']);
  });
});
