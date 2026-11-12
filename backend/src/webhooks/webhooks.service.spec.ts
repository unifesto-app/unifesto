import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { sealSecret } from '../common/secrets';
import { DISABLE_AFTER, WebhooksService } from './webhooks.service';

process.env.JWT_SECRET ??= 'test-jwt-secret';
const sealed = () => sealSecret('whsec_test', 'WEBHOOK_SECRET_KEY', 'webhook-secret');

describe('WebhooksService', () => {
  let server: http.Server;
  let base: string;
  let answer = 200;
  const received: { headers: http.IncomingHttpHeaders; body: string }[] = [];
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE = '1';
    process.env.NODE_ENV = 'test';
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(answer);
        res.end();
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
    answer = 200;
    received.length = 0;
  });

  const build = (opts: { hook?: Record<string, unknown>; spaceOn?: boolean; spaceStatus?: string } = {}) => {
    const hook = {
      id: 'wh-1',
      url: `${base}/hook`,
      secretEnc: sealed(),
      isActive: true,
      disabledAt: null,
      failureCount: 0,
      space: { status: opts.spaceStatus ?? 'ACTIVE', integrationsEnabled: opts.spaceOn ?? true },
      ...opts.hook,
    };
    const delivery = { id: 'd-1', status: 'PENDING', payload: { type: 'registration.confirmed', createdAt: 'now', data: { registrationId: 'reg-1' } }, webhook: hook };
    const prisma: any = {
      eventRegistration: {
        findUnique: jest.fn(async () => ({
          id: 'reg-1',
          ticketTypeId: 'tt-1',
          status: 'REGISTERED',
          paymentStatus: 'PAID',
          totalAmount: '0',
          attendeeMobile: '+919876543210',
          utmSource: 'wegobeyond site',
          checkedInAt: null,
          event: { id: 'ev-1', slug: 'build-sunday', title: 'Build Sunday', spaceId: 'sp-1', space: { integrationsEnabled: opts.spaceOn ?? true } },
          user: { fullName: 'Asha Rao', mobileNumber: '+0000000001', identities: [{ email: 'asha@example.com' }] },
        })),
      },
      spaceWebhook: {
        findMany: jest.fn(async () => [{ id: 'wh-1' }]),
        update: jest.fn(async ({ data }: any) => ({ failureCount: data.failureCount?.increment ? hook.failureCount + 1 : 0, disabledAt: null })),
      },
      webhookDelivery: {
        create: jest.fn(async () => ({ id: 'd-1' })),
        findUnique: jest.fn(async () => delivery),
        update: jest.fn(async () => ({})),
      },
    };
    const queue: any = { setHandler: jest.fn(), add: jest.fn(async () => undefined) };
    return { svc: new WebhooksService(prisma, queue), prisma, queue };
  };

  it('turns a registration event into one queued delivery per matching webhook', async () => {
    const { svc, prisma, queue } = build();
    await svc.onRegistrationEvent({ type: 'registration.confirmed', registrationId: 'reg-1' });
    expect(prisma.spaceWebhook.findMany.mock.calls[0][0].where).toMatchObject({
      spaceId: 'sp-1',
      isActive: true,
      disabledAt: null,
      events: { has: 'registration.confirmed' },
    });
    const payload = prisma.webhookDelivery.create.mock.calls[0][0].data.payload;
    expect(payload.data).toMatchObject({
      registrationId: 'reg-1',
      eventSlug: 'build-sunday',
      amount: 0,
      // The account's mobile is a placeholder, so the typed one is used.
      attendee: { name: 'Asha Rao', email: 'asha@example.com', phone: '+919876543210' },
    });
    expect(queue.add).toHaveBeenCalledWith('d-1');
  });

  it('sends nothing for a space with API access off', async () => {
    const { svc, prisma } = build({ spaceOn: false });
    await svc.onRegistrationEvent({ type: 'registration.confirmed', registrationId: 'reg-1' });
    expect(prisma.webhookDelivery.create).not.toHaveBeenCalled();
  });

  it('delivers a signed body and records it', async () => {
    const { svc, prisma } = build();
    await svc.deliver('d-1', false);
    expect(received).toHaveLength(1);
    expect(JSON.parse(received[0].body)).toMatchObject({ id: 'd-1', type: 'registration.confirmed' });
    expect(received[0].headers['unifesto-webhook-signature']).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(prisma.webhookDelivery.update.mock.calls[0][0].data).toMatchObject({ status: 'DELIVERED', lastStatusCode: 200 });
  });

  it('a failure retries (throws) until the last attempt, which marks it FAILED', async () => {
    answer = 500;
    const { svc, prisma } = build();
    await expect(svc.deliver('d-1', false)).rejects.toThrow('HTTP 500');
    expect(prisma.webhookDelivery.update.mock.calls[0][0].data.status).toBe('PENDING');
    await expect(svc.deliver('d-1', true)).resolves.toBeUndefined();
    expect(prisma.webhookDelivery.update.mock.calls[1][0].data.status).toBe('FAILED');
  });

  it(`switches the webhook off after ${DISABLE_AFTER} failures in a row`, async () => {
    answer = 500;
    const { svc, prisma } = build({ hook: { failureCount: DISABLE_AFTER - 1 } });
    await svc.deliver('d-1', true);
    expect(prisma.spaceWebhook.update).toHaveBeenLastCalledWith({ where: { id: 'wh-1' }, data: { disabledAt: expect.any(Date) } });
  });

  it('skips, without sending, for a space taken down or a webhook switched off', async () => {
    for (const opts of [{ spaceStatus: 'SUSPENDED' }, { spaceOn: false }, { hook: { isActive: false } }]) {
      const { svc, prisma } = build(opts);
      await svc.deliver('d-1', false);
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({ where: { id: 'd-1' }, data: { status: 'SKIPPED' } });
    }
    expect(received).toHaveLength(0);
  });
});
