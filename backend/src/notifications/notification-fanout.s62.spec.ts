import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { NotificationEvents } from './notifications.constants';
import { NotificationFanoutQueue, pack, unpack } from './notification-fanout.queue';

const approvedAt = new Date('2026-11-03T10:00:00.000Z');
const batch = {
  kind: 'space.approved',
  items: [
    { userId: 'u1', data: { spaceId: 's1', approvedAt } },
    { userId: 'u2', data: { spaceId: 's1', approvedAt }, dedupKey: 'k2' },
  ],
};

/** Every on<Key> method, recording what it was called with. */
function handler() {
  const calls: [string, unknown][] = [];
  const h: any = {};
  for (const key of Object.keys(NotificationEvents)) h[`on${key}`] = jest.fn(async (e: unknown) => void calls.push([key, e]));
  return { h, calls };
}

/** A fan-out with no Redis, or with `queue` standing in for BullMQ. */
function fanout(queue?: object) {
  const events = new EventEmitter2();
  const { h, calls } = handler();
  const redis: any = { createClient: () => null, getClient: () => (queue ? {} : null) };
  const svc = new NotificationFanoutQueue(redis, events as any, h);
  svc.onModuleInit();
  if (queue) (svc as any).queue = queue;
  return { svc, events, calls };
}

const tick = () => new Promise((r) => setImmediate(r));

describe('notification fan-out on BullMQ (S62)', () => {
  it('job data keeps Dates as Dates and strings as strings', () => {
    const back = unpack(pack({ at: approvedAt, deep: [{ at: approvedAt }], iso: approvedAt.toISOString() })) as any;
    expect(back.at).toEqual(approvedAt);
    expect(back.deep[0].at).toBeInstanceOf(Date);
    expect(back.iso).toBe('2026-11-03T10:00:00.000Z');
  });

  it('an emit is queued under its key, not sent in-process', async () => {
    const queue = { add: jest.fn(async (..._args: unknown[]) => ({})), addBulk: jest.fn() };
    const { events, calls } = fanout(queue);
    const e = { userId: 'u1', eventId: 'e1', eventTitle: 'Fest' };
    events.emit(NotificationEvents.RegistrationConfirmed, e);
    await tick();
    expect(queue.add).toHaveBeenCalledWith('RegistrationConfirmed', { json: pack(e) }, expect.objectContaining({ removeOnComplete: true }));
    expect(queue.add.mock.calls[0][2]).not.toHaveProperty('attempts');
    expect(calls).toEqual([]);
  });

  it('a NotifyBatch becomes one job per person, behind single events', async () => {
    const queue = { add: jest.fn(), addBulk: jest.fn(async () => []) };
    const { events } = fanout(queue);
    events.emit(NotificationEvents.NotifyBatch, batch);
    await tick();
    const jobs = (queue.addBulk.mock.calls[0] as any)[0];
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j: any) => j.name === 'NotifyBatch' && j.opts.priority === 1)).toBe(true);
    expect(unpack(jobs[1].data.json)).toEqual({ kind: 'space.approved', items: [batch.items[1]] });
  });

  it('falls back to sending inline when the queue rejects or Redis is down', async () => {
    const queue = { add: jest.fn(async () => Promise.reject(new Error('down'))), addBulk: jest.fn() };
    for (const f of [fanout(queue), fanout()]) {
      f.events.emit(NotificationEvents.StatusIncident, { incidentId: 'i1' });
      await tick();
      expect(f.calls).toEqual([['StatusIncident', { incidentId: 'i1' }]]);
    }
  });
});

// Against a real Redis (about a minute): REDIS_TEST_PORT=56380 npx jest notification-fanout --forceExit
const port = process.env.REDIS_TEST_PORT;
(port ? describe : describe.skip)('notification fan-out across a restart (S62, real Redis)', () => {
  const redises: RedisService[] = [];
  async function replica(h: any) {
    const redis = new RedisService({ get: (k: string) => ({ REDIS_HOST: '127.0.0.1', REDIS_PORT: Number(port) })[k] } as any);
    await redis.onModuleInit();
    redises.push(redis);
    const svc = new NotificationFanoutQueue(redis, new EventEmitter2() as any, h);
    svc.onModuleInit();
    (svc as any).worker.on('error', () => undefined); // the "crashed" replica's worker loses its connection
    return { svc, events: (svc as any).events as EventEmitter2 };
  }
  /** Kill a replica without a graceful shutdown: no worker.close(), its jobs stay where they are. */
  const crash = (svc: NotificationFanoutQueue) => (svc as any).connections.forEach((c: any) => c.disconnect());

  beforeEach(async () => {
    const q = new Queue('notifications', { connection: { host: '127.0.0.1', port: Number(port) } });
    await q.obliterate({ force: true });
    await q.close();
  });
  afterAll(async () => {
    for (const r of redises) await r.onModuleDestroy();
  });

  it('an event queued before a crash is sent by the next boot, Dates intact', async () => {
    const a = await replica(handler().h);
    await (a.svc as any).worker.close(); // emitted, then the process died before its worker took it
    a.events.emit(NotificationEvents.NotifyBatch, batch);
    await new Promise((r) => setTimeout(r, 200));
    crash(a.svc);

    const { h, calls } = handler();
    const b = await replica(h);
    for (let i = 0; i < 100 && calls.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
    expect(calls.map(([, e]: any) => e.items[0].userId).sort()).toEqual(['u1', 'u2']);
    expect((calls[0][1] as any).items[0].data.approvedAt).toBeInstanceOf(Date);
    await b.svc.onModuleDestroy();
  });

  it('a job a crash left mid-send fails instead of sending again', async () => {
    const stuck = handler();
    stuck.h.onRegistrationConfirmed = jest.fn(() => new Promise(() => undefined)); // the send never returns
    const a = await replica(stuck.h);
    a.events.emit(NotificationEvents.RegistrationConfirmed, { userId: 'u1' });
    for (let i = 0; i < 100 && !stuck.h.onRegistrationConfirmed.mock.calls.length; i++) await new Promise((r) => setTimeout(r, 50));
    crash(a.svc);

    const { h, calls } = handler();
    const b = await replica(h);
    const failed = new Promise((r) => (b.svc as any).worker.on('failed', r));
    await failed; // the stalled check runs twice (30s apart) before it gives up on the job
    expect(calls).toEqual([]);
    await b.svc.onModuleDestroy();
  }, 120_000);
});
