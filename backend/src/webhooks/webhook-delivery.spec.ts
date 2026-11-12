import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openSecret, sealSecret } from '../common/secrets';
import { assertWebhookUrl, newWebhookSecret, sendWebhook, signWebhook, webhookHeaders } from './webhook-delivery.util';

describe('webhook signing', () => {
  it('matches an independent HMAC-SHA256 of id.timestamp.body (openssl)', () => {
    expect(signWebhook('whsec_test', 'evt_1', 1_700_000_000, '{"a":1}')).toBe(
      '8b7abda022d1032b001d413b787d1d9c6dfbadba36ee2a7a91333569f777b61c',
    );
    expect(webhookHeaders('whsec_test', 'evt_1', 1_700_000_000, '{"a":1}')['Unifesto-Webhook-Signature']).toBe(
      'v1=8b7abda022d1032b001d413b787d1d9c6dfbadba36ee2a7a91333569f777b61c',
    );
  });

  it('keeps secrets encrypted at rest and reads them back', () => {
    const get = (k: string) => (k === 'JWT_SECRET' ? 'test-jwt-secret' : undefined);
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    const sealed = sealSecret(secret, 'WEBHOOK_SECRET_KEY', 'webhook-secret', get);
    expect(sealed).not.toContain(secret.slice(6, 20));
    expect(openSecret(sealed, 'WEBHOOK_SECRET_KEY', 'webhook-secret', get)).toBe(secret);
    // Another purpose's key can't open it.
    expect(() => openSecret(sealed, 'OTHER_KEY', 'other', get)).toThrow();
  });
});

describe('assertWebhookUrl', () => {
  it('takes a public https URL', () => {
    expect(assertWebhookUrl('https://wegobeyond.in/hooks/unifesto', false).hostname).toBe('wegobeyond.in');
  });

  it.each([
    ['http://wegobeyond.in/hook', 'https://'],
    ['https://user:pw@wegobeyond.in/hook', 'username or password'],
    ['https://wegobeyond.in:8443/hook', 'standard https port'],
    ['https://localhost/hook', 'public address'],
    ['https://localhost./hook', 'public address'],
    ['https://127.0.0.1/hook', 'public address'],
    ['https://169.254.169.254/latest/meta-data', 'public address'],
    ['https://10.0.0.8/hook', 'public address'],
    ['https://[::1]/hook', 'public address'],
    ['https://[::ffff:127.0.0.1]/hook', 'public address'],
    ['https://[::]/hook', 'public address'],
    ['https://2130706433/hook', 'public address'],
    ['https://0x7f000001/hook', 'public address'],
    ['https://127.1/hook', 'public address'],
    ['https://0/hook', 'public address'],
    ['https://127.0.0.1./hook', 'public address'],
    ['https://printer.local/hook', 'public address'],
    ['not a url', 'full webhook URL'],
  ])('refuses %s', (raw, why) => {
    expect(() => assertWebhookUrl(raw, false)).toThrow(why);
  });
});

describe('sendWebhook', () => {
  let server: http.Server;
  let base: string;
  const seen: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  const env = { ...process.env };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ headers: req.headers, body });
        if (req.url === '/dribble') {
          // One byte every 300 ms, forever: never idle long enough to time out.
          res.writeHead(200);
          const t = setInterval(() => res.write('x'), 300);
          res.on('close', () => clearInterval(t));
          return;
        }
                if (req.url === '/redirect') {
          res.writeHead(302, { Location: 'http://169.254.169.254/' });
          return res.end();
        }
        res.writeHead(req.url === '/fail' ? 500 : 200);
        res.end('x'.repeat(10_000));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    process.env = env;
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    process.env.NODE_ENV = 'test';
  });

  it('posts the signed body and reports a 2xx as delivered', async () => {
    const body = JSON.stringify({ id: 'evt_2', type: 'registration.confirmed' });
    const r = await sendWebhook(new URL(`${base}/ok`), webhookHeaders('whsec_x', 'evt_2', 1, body), body);
    expect(r).toMatchObject({ ok: true, status: 200, error: null });
    const got = seen.at(-1)!;
    expect(got.body).toBe(body);
    expect(got.headers['unifesto-webhook-signature']).toBe(`v1=${signWebhook('whsec_x', 'evt_2', 1, body)}`);
  });

  it('never follows a redirect: a 3xx is a failure', async () => {
    const before = seen.length;
    const r = await sendWebhook(new URL(`${base}/redirect`), {}, '{}');
    expect(r).toMatchObject({ ok: false, status: 302 });
    expect(seen.length).toBe(before + 1); // only the one request
  });

  it('gives up at its deadline on a receiver that dribbles bytes forever', async () => {
    const started = Date.now();
    const r = await sendWebhook(new URL(`${base}/dribble`), {}, '{}', 1500);
    expect(Date.now() - started).toBeLessThan(4000);
    // The receiver had answered 200 before stalling: the cut-off still ends the call.
    expect(r.durationMs).toBeLessThan(4000);
  });

  it('reports a 5xx as a failure', async () => {
    expect(await sendWebhook(new URL(`${base}/fail`), {}, '{}')).toMatchObject({ ok: false, status: 500, error: 'HTTP 500' });
  });

  it('refuses at connect time a name that resolves to a private address', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '0';
    const r = await sendWebhook(new URL('https://localhost/hook'), {}, '{}');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('EBLOCKED');
  });
});
