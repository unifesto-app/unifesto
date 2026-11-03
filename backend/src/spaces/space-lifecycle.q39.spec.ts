import { readFileSync } from 'fs';
import { join } from 'path';
import { SpaceStatus } from '@prisma/client';
import { NotificationEvents } from '../notifications/notifications.constants';
import { AdminService } from '../admin/admin.service';
import { abandonedWhere, changedBy, SpaceLifecycleService, statusChange } from './space-lifecycle';
import { SpacesService } from './spaces.service';

/**
 * Q39: four statuses. Owners pause, resume, archive and restore their own
 * space; Platform suspends with a reason and the owner is told; abandoned
 * spaces are warned, then archived by the system, and the owner can restore.
 */

const OWNER = 'u-owner';
const DAY = 24 * 60 * 60 * 1000;

function lifecycle(space: Record<string, unknown>, money: { payouts?: number; refunds?: number } = {}) {
  const row = {
    id: 'sp-1',
    status: SpaceStatus.ACTIVE,
    createdBy: OWNER,
    statusReason: null,
    statusChangedAt: null,
    statusChangedBy: null,
    ...space,
  };
  const prisma: any = {
    space: {
      findUnique: jest.fn(async () => row),
      findMany: jest.fn(async () => []),
      updateMany: jest.fn(async ({ data }: any) => {
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
    userRole: { findFirst: jest.fn(async () => null) },
    eventRegistration: { count: jest.fn(async () => 3) },
    payout: { count: jest.fn(async () => money.payouts ?? 0) },
    refundRequest: { count: jest.fn(async () => money.refunds ?? 0) },
    spaceStatusRequest: { findFirst: jest.fn(async () => null) },
  };
  const events = { emit: jest.fn() };
  const redis: any = { runExclusive: jest.fn(async (_k: string, _t: number, fn: () => Promise<void>) => (await fn(), true)) };
  const svc = new SpaceLifecycleService(prisma, redis, events as any);
  return { svc, prisma, events, row };
}

describe('owner pause and resume (Q39)', () => {
  it('an Apex-approved (APPROVED) space pauses itself, then resumes, with no request', async () => {
    const { svc, prisma, row } = lifecycle({ status: SpaceStatus.APPROVED });
    const paused = await svc.setByOwner(OWNER, 'sp-1', 'INACTIVE');
    expect(prisma.space.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'sp-1', status: SpaceStatus.APPROVED },
      data: expect.objectContaining({ status: 'INACTIVE', statusChangedBy: OWNER, archiveWarnedAt: null }),
    });
    expect(paused).toMatchObject({ status: 'INACTIVE', changedBy: 'owner', upcomingTicketsSold: 3 });

    const resumed = await svc.setByOwner(OWNER, 'sp-1', 'ACTIVE');
    expect(row.status).toBe('ACTIVE');
    expect(resumed.status).toBe('ACTIVE');
  });

  it('shows a live APPROVED row as ACTIVE, with the tickets a pause would touch', async () => {
    const { svc } = lifecycle({ status: SpaceStatus.APPROVED });
    await expect(svc.view(OWNER, 'sp-1')).resolves.toMatchObject({ status: 'ACTIVE', changedBy: null, upcomingTicketsSold: 3 });
  });

  it('only the owner changes it; strangers get a 404 on the view', async () => {
    const { svc } = lifecycle({});
    await expect(svc.setByOwner('u-admin-member', 'sp-1', 'INACTIVE')).rejects.toThrow(/Only the space owner/);
    await expect(svc.view('u-stranger', 'sp-1')).rejects.toThrow(/not found/);
  });

  it('a suspended space cannot resume itself', async () => {
    const { svc } = lifecycle({ status: SpaceStatus.SUSPENDED, statusChangedBy: 'u-staff', statusChangedAt: new Date() });
    await expect(svc.setByOwner(OWNER, 'sp-1', 'ACTIVE')).rejects.toThrow(/Appeal/);
    await expect(svc.setByOwner(OWNER, 'sp-1', 'ARCHIVED')).rejects.toThrow(/live or paused/);
  });

  it('a racing change loses the claim', async () => {
    const { svc, prisma } = lifecycle({});
    prisma.space.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.setByOwner(OWNER, 'sp-1', 'INACTIVE')).rejects.toThrow(/just changed/);
  });
});

describe('owner archive and restore (Q39)', () => {
  it('archives when no payout or refund is open', async () => {
    const { svc, row } = lifecycle({});
    await svc.setByOwner(OWNER, 'sp-1', 'ARCHIVED');
    expect(row.status).toBe('ARCHIVED');
  });

  it.each([
    ['payout', { payouts: 1 }],
    ['refund', { refunds: 2 }],
  ])('refuses while a %s is open', async (_n, money) => {
    const { svc, prisma } = lifecycle({}, money);
    await expect(svc.setByOwner(OWNER, 'sp-1', 'ARCHIVED')).rejects.toThrow(/Settle open payouts and refunds/);
    expect(prisma.space.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['owner', OWNER, new Date()],
    ['system', null, new Date()],
  ])('restores a space the %s archived', async (_who, by, at) => {
    const { svc, row } = lifecycle({ status: SpaceStatus.ARCHIVED, statusChangedBy: by, statusChangedAt: at });
    await expect(svc.view(OWNER, 'sp-1')).resolves.toMatchObject({ canRestore: true });
    await svc.setByOwner(OWNER, 'sp-1', 'ACTIVE');
    expect(row.status).toBe('ACTIVE');
  });

  it.each([
    ['Platform', 'u-staff', new Date()],
    ['an older change', null, null],
  ])('a space archived by %s needs a request', async (_who, by, at) => {
    const { svc } = lifecycle({ status: SpaceStatus.ARCHIVED, statusChangedBy: by, statusChangedAt: at });
    await expect(svc.view(OWNER, 'sp-1')).resolves.toMatchObject({ canRestore: false });
    await expect(svc.setByOwner(OWNER, 'sp-1', 'ACTIVE')).rejects.toThrow(/Ask Unifesto/);
  });

  it('changedBy reads null-by-with-a-time as the system', () => {
    expect(changedBy({ createdBy: OWNER, statusChangedBy: null, statusChangedAt: new Date() })).toBe('system');
    expect(changedBy({ createdBy: OWNER, statusChangedBy: null, statusChangedAt: null })).toBe('platform');
    expect(changedBy({ createdBy: OWNER, statusChangedBy: OWNER, statusChangedAt: new Date() })).toBe('owner');
  });
});

describe('abandoned spaces (Q39)', () => {
  const now = new Date('2027-06-01T00:00:00Z');

  it('abandoned = Unverified, no events, no sub-spaces, free plan, untouched since the cutoff', () => {
    const cutoff = new Date(now.getTime() - 180 * DAY);
    expect(abandonedWhere(cutoff)).toMatchObject({
      status: { in: ['ACTIVE', 'APPROVED', 'INACTIVE'] },
      verifiedAt: null,
      createdAt: { lte: cutoff },
      events: { none: {} },
      childSpaces: { none: {} },
      plan: 'STARTER',
    });
  });

  it('warns at 166 days, archives at 180 once the warning is 14 days old, as the system', async () => {
    const { svc, prisma, events } = lifecycle({});
    const seeded = { id: 'sp-old', name: 'Old Club', createdBy: OWNER, status: SpaceStatus.ACTIVE };
    prisma.space.findMany.mockResolvedValueOnce([seeded]).mockResolvedValueOnce([seeded]);

    await expect(svc.runAbandonedSweep(now)).resolves.toEqual({ warned: 1, archived: 1 });

    const [warnQuery, archiveQuery] = prisma.space.findMany.mock.calls.map((c: any[]) => c[0].where);
    expect(warnQuery.createdAt.lte).toEqual(new Date(now.getTime() - 166 * DAY));
    expect(warnQuery.archiveWarnedAt).toBeNull();
    expect(archiveQuery.createdAt.lte).toEqual(new Date(now.getTime() - 180 * DAY));
    expect(archiveQuery.archiveWarnedAt).toEqual({ lte: new Date(now.getTime() - 14 * DAY) });

    const [, archiveWrite] = prisma.space.updateMany.mock.calls.map((c: any[]) => c[0]);
    expect(archiveWrite.where).toMatchObject({ id: 'sp-old', status: 'ACTIVE', events: { none: {} } });
    expect(archiveWrite.data).toMatchObject({ status: 'ARCHIVED', statusChangedBy: null, statusReason: 'No events in 180 days' });

    const kinds = events.emit.mock.calls.map((c: any[]) => [c[0], c[1].kind]);
    expect(kinds).toEqual([
      [NotificationEvents.NotifyBatch, 'space.archive_warning'],
      [NotificationEvents.NotifyBatch, 'space.status'],
    ]);
    expect(events.emit.mock.calls[1][1].items[0].data).toMatchObject({ status: 'ARCHIVED', bySystem: true });
  });

  it('does not archive a space that gained an event since the read', async () => {
    const { svc, prisma, events } = lifecycle({});
    prisma.space.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'sp-x', name: 'X', createdBy: OWNER, status: 'ACTIVE' }]);
    prisma.space.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(svc.runAbandonedSweep(now)).resolves.toEqual({ warned: 0, archived: 0 });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('every status write clears the warning, so a restored space gets a fresh 180 days and a new warning', () => {
    expect(statusChange(SpaceStatus.ACTIVE, OWNER)).toMatchObject({ archiveWarnedAt: null, statusChangedBy: OWNER });
  });
});

describe('Platform status from Apex (Q39)', () => {
  const build = (status: SpaceStatus = SpaceStatus.ACTIVE) => {
    const prisma: any = {
      space: {
        findUnique: jest.fn(async () => ({ id: 'sp-1', name: 'Robotics Club', status, createdBy: OWNER })),
        update: jest.fn(async ({ data }: any) => ({ id: 'sp-1', ...data })),
      },
    };
    const notify = { notify: jest.fn(async () => ({})) };
    const svc = new AdminService(prisma, {} as any, {} as any, { get: () => 'ap-south-1' } as any, notify as any, {} as any);
    return { svc, prisma, notify };
  };

  it('suspending needs a reason', async () => {
    const { svc, prisma } = build();
    await expect(svc.updateSpaceStatus('sp-1', SpaceStatus.SUSPENDED, 'u-staff', '  ')).rejects.toThrow(/reason/);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it('suspending stores who and why, and tells the owner by push and email', async () => {
    const { svc, prisma, notify } = build();
    await svc.updateSpaceStatus('sp-1', SpaceStatus.SUSPENDED, 'u-staff', ' Fake tickets reported ');
    expect(prisma.space.update.mock.calls[0][0].data).toMatchObject({
      status: 'SUSPENDED',
      statusReason: 'Fake tickets reported',
      statusChangedBy: 'u-staff',
    });
    expect(notify.notify).toHaveBeenCalledWith(
      OWNER,
      'space.status',
      expect.objectContaining({ spaceId: 'sp-1', status: 'SUSPENDED', reason: 'Fake tickets reported' }),
    );
  });

  it.each([SpaceStatus.APPROVED, SpaceStatus.PENDING, SpaceStatus.REJECTED])('never writes %s', async (status) => {
    const { svc, prisma } = build();
    await expect(svc.updateSpaceStatus('sp-1', status, 'u-staff')).rejects.toThrow(/Choose one of/);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it('an APPROVED space is already active', async () => {
    const { svc } = build(SpaceStatus.APPROVED);
    await expect(svc.updateSpaceStatus('sp-1', SpaceStatus.ACTIVE, 'u-staff')).rejects.toThrow(/already active/);
  });
});

describe('status requests are appeals only (Q39)', () => {
  const build = (status: SpaceStatus) => {
    const prisma: any = {
      space: { findUnique: jest.fn(async () => ({ id: 'sp-1', name: 'Club', status, createdBy: OWNER })) },
      spaceStatusRequest: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async ({ data }: any) => ({ id: 'r1', ...data })),
      },
    };
    const svc = new SpacesService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, { emit: jest.fn() } as any);
    return { svc, prisma };
  };

  it.each([SpaceStatus.APPROVED, SpaceStatus.ACTIVE, SpaceStatus.INACTIVE])('%s: pause and resume are self-serve', async (status) => {
    const { svc, prisma } = build(status);
    await expect(
      svc.createSpaceStatusRequest(OWNER, { spaceId: 'sp-1', requestedStatus: 'INACTIVE', reason: 'x' }),
    ).rejects.toThrow(/yourself/);
    expect(prisma.spaceStatusRequest.create).not.toHaveBeenCalled();
  });

  it.each([SpaceStatus.SUSPENDED, SpaceStatus.ARCHIVED])('%s: the owner can ask to come back', async (status) => {
    const { svc, prisma } = build(status);
    await svc.createSpaceStatusRequest(OWNER, { spaceId: 'sp-1', requestedStatus: 'ACTIVE', reason: 'We fixed it' });
    expect(prisma.spaceStatusRequest.create).toHaveBeenCalled();
  });
});

describe('20261130090000_space_status_cleanup', () => {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations/20261130090000_space_status_cleanup/migration.sql'),
    'utf8',
  )
    .replace(/--.*$/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  it('moves APPROVED rows to ACTIVE and keeps the enum value', () => {
    expect(sql).toContain(`UPDATE "spaces" SET "status" = 'ACTIVE' WHERE "status" = 'APPROVED';`);
    expect(sql).not.toMatch(/DROP|ALTER TYPE/);
  });

  it('adds the who, when and why columns', () => {
    for (const col of ['status_reason', 'status_changed_at', 'status_changed_by', 'archive_warned_at']) {
      expect(sql).toContain(`ADD COLUMN "${col}"`);
    }
  });
});
