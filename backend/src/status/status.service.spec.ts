import { IncidentImpact, IncidentStatus } from '@prisma/client';
import { StatusService } from './status.service';

/**
 * In-memory stand-in for the three tables the status service touches, so the
 * sampler → auto-incident → summary loop can be exercised end to end.
 */
function makeHarness() {
  let checks: { service: string; up: boolean; latencyMs: number | null; checkedAt: Date }[] = [];
  let incidents: any[] = [];
  let nextId = 1;

  const prisma: any = {
    healthCheck: {
      createMany: jest.fn(async ({ data }) => {
        checks.push(...data);
      }),
      findFirst: jest.fn(async () => {
        const last = [...checks].sort((a, b) => +b.checkedAt - +a.checkedAt)[0];
        return last ? { checkedAt: last.checkedAt } : null;
      }),
      findMany: jest.fn(async ({ where, take, orderBy }) => {
        let rows = checks;
        if (where?.service) rows = rows.filter((r) => r.service === where.service);
        if (where?.checkedAt?.gte) rows = rows.filter((r) => r.checkedAt >= where.checkedAt.gte);
        rows = [...rows].sort((a, b) =>
          orderBy?.checkedAt === 'desc' ? +b.checkedAt - +a.checkedAt : +a.checkedAt - +b.checkedAt,
        );
        return take ? rows.slice(0, take) : rows;
      }),
    },
    incident: {
      findMany: jest.fn(async ({ where }) =>
        incidents.filter((i) => {
          if (where?.createdBy === null && i.createdBy !== null) return false;
          if (where?.resolvedAt === null && i.resolvedAt !== null) return false;
          return true;
        }),
      ),
      create: jest.fn(async ({ data }) => {
        const row = { id: String(nextId++), resolvedAt: null, startedAt: new Date(), ...data };
        incidents.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = incidents.find((i) => i.id === where.id);
        Object.assign(row, data);
        return row;
      }),
    },
    apiLog: { count: jest.fn(async () => 0) },
  };

  const health = { database: true, redis: true, storage: true };
  const admin: any = {
    getHealthStatus: jest.fn(async () => ({
      timestamp: new Date().toISOString(),
      services: {
        app: { status: 'online' },
        database: { status: health.database ? 'connected' : 'disconnected', latency: 1 },
        redis: { status: health.redis ? 'connected' : 'disconnected', latency: 1 },
        storage: { status: health.storage ? 'connected' : 'disconnected', latency: 1 },
      },
    })),
  };
  const redis: any = { setNx: jest.fn(async () => true) };
  const events: any = { emit: jest.fn() };

  const service = new StatusService(prisma, admin, redis, events);
  return {
    service,
    events,
    health,
    prisma,
    get incidents() {
      return incidents;
    },
    setChecks(c: typeof checks) {
      checks = c;
    },
    setIncidents(i: any[]) {
      incidents = i;
    },
  };
}

describe('StatusService', () => {
  it('reports unknown (not operational) when the sampler has stopped', async () => {
    const h = makeHarness();
    const old = new Date(Date.now() - 60 * 60 * 1000);
    h.setChecks(
      ['api', 'database', 'redis', 'storage'].map((service) => ({
        service,
        up: true,
        latencyMs: 1,
        checkedAt: old,
      })),
    );
    const s = await h.service.getSummary();
    expect(s.stale).toBe(true);
    expect(s.overall).toBe('unknown');
  });

  it('lets an open incident override green health', async () => {
    const h = makeHarness();
    await h.service.sample();
    h.setIncidents([
      { id: 'm1', impact: IncidentImpact.CRITICAL, resolvedAt: null, createdBy: 'u1', startedAt: new Date() },
    ]);
    expect((await h.service.getSummary()).overall).toBe('major_outage');

    h.setIncidents([
      { id: 'm2', impact: IncidentImpact.MINOR, resolvedAt: null, createdBy: 'u1', startedAt: new Date() },
    ]);
    expect((await h.service.getSummary()).overall).toBe('degraded');

    h.setIncidents([
      { id: 'm3', impact: IncidentImpact.NONE, resolvedAt: null, createdBy: 'u1', startedAt: new Date() },
    ]);
    expect((await h.service.getSummary()).overall).toBe('operational');
  });

  it('opens an incident after 2 down samples and resolves it on recovery', async () => {
    const h = makeHarness();
    const now = Date.now();
    jest.spyOn(Date, 'now');

    // Tick helper: sample at a given minute offset so rows sort correctly.
    const tick = async (min: number) => {
      (Date.now as jest.Mock).mockReturnValue(now + min * 60_000);
      jest.useFakeTimers({ now: now + min * 60_000, doNotFake: ['nextTick', 'setImmediate'] });
      await h.service.sample();
      jest.useRealTimers();
    };

    await tick(0);
    h.health.database = false;
    await tick(5);
    expect(h.incidents).toHaveLength(0); // one blip is not an incident
    await tick(10);
    expect(h.incidents).toHaveLength(1);
    expect(h.events.emit).toHaveBeenCalledWith(
      'notif.status.incident',
      expect.objectContaining({ kind: 'opened', serviceName: 'Database', impact: 'CRITICAL' }),
    );
    expect(h.incidents[0]).toMatchObject({
      title: 'Database is down',
      impact: IncidentImpact.CRITICAL,
      affectedServices: ['database'],
      createdBy: null,
    });

    // Admin closes it by hand mid-outage: must not be reopened every tick.
    h.incidents[0].resolvedAt = new Date();
    await tick(15);
    expect(h.incidents).toHaveLength(1);

    // Reopen it, then recover: auto-resolves.
    h.incidents[0].resolvedAt = null;
    h.health.database = true;
    await tick(20);
    expect(h.incidents[0].status).toBe(IncidentStatus.RESOLVED);
    expect(h.incidents[0].resolvedAt).toBeInstanceOf(Date);
    expect(h.events.emit).toHaveBeenLastCalledWith(
      'notif.status.incident',
      expect.objectContaining({ kind: 'resolved', serviceName: 'Database' }),
    );
    // opened + resolved only: the manual close / hold ticks sent nothing.
    expect(h.events.emit).toHaveBeenCalledTimes(2);
    (Date.now as jest.Mock).mockRestore();
  });

  it('records a sampling gap as a resolved incident', async () => {
    const h = makeHarness();
    h.setChecks([
      { service: 'api', up: true, latencyMs: 1, checkedAt: new Date(Date.now() - 40 * 60_000) },
    ]);
    await h.service.sample();
    const gap = h.incidents.find((i) => i.title.startsWith('No health checks'));
    expect(gap).toBeDefined();
    expect(gap.status).toBe(IncidentStatus.RESOLVED);
    expect(gap.title).toBe('No health checks for 40 min');
    expect(h.events.emit).toHaveBeenCalledWith(
      'notif.status.incident',
      expect.objectContaining({ kind: 'gap', durationMin: 40 }),
    );
  });

  it('marks the API down on a high 5xx rate', async () => {
    const h = makeHarness();
    h.prisma.apiLog.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(50); // 5xx
    await h.service.sample();
    const rows = await h.prisma.healthCheck.findMany({ where: { service: 'api' } });
    expect(rows[0].up).toBe(false);
  });
});
