import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service';
import { SpacesService } from '../spaces/spaces.service';

/**
 * J10: writes that reach across tenants — ticket types of another event,
 * space structure via PATCH /spaces/:id, sub-space requests, sub-event attach
 * onto someone else's parent — and the analytics walk on a cyclic hierarchy.
 */

function eventsSvc(prisma: any) {
  const cache: any = { invalidateEventCache: jest.fn(async () => undefined) };
  const authz: any = { can: jest.fn(async () => true), canAny: jest.fn(async () => false) };
  return new EventsService(prisma, {} as any, {} as any, cache, {} as any, {} as any, { emit: jest.fn() } as any, authz);
}

describe('deleteTicketType (J10)', () => {
  function build(ticketEventId: string) {
    const prisma: any = {
      event: { findUnique: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1', slug: 'fest' })) },
      eventTicketType: {
        findUnique: jest.fn(async () => ({ eventId: ticketEventId })),
        delete: jest.fn(async () => ({ id: 'tt-1' })),
      },
      eventRegistration: { count: jest.fn(async () => 0) },
    };
    const svc = eventsSvc(prisma);
    jest.spyOn(svc, 'canManageEvent').mockResolvedValue(true);
    return { svc, prisma };
  }

  it("404s on another event's ticket type and deletes nothing", async () => {
    const { svc, prisma } = build('ev-other');
    await expect(svc.deleteTicketType('u-1', 'ev-1', 'tt-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.eventTicketType.delete).not.toHaveBeenCalled();
  });

  it("deletes the event's own ticket type", async () => {
    const { svc, prisma } = build('ev-1');
    await svc.deleteTicketType('u-1', 'ev-1', 'tt-1');
    expect(prisma.eventTicketType.delete).toHaveBeenCalledWith({ where: { id: 'tt-1' } });
  });
});

describe('attachSubEvent checks the parent (J10)', () => {
  it("refuses to hang your event under a parent you can't manage", async () => {
    const prisma: any = {
      event: {
        findUnique: jest.fn(async ({ where }: any) =>
          where.id === 'child'
            ? { id: 'child', spaceId: 'sp-1', slug: 'c', deletedAt: null, parentEventId: null, _count: { childEvents: 0 } }
            : { id: 'parent', spaceId: 'sp-2' },
        ),
        update: jest.fn(),
      },
    };
    const svc = eventsSvc(prisma);
    jest.spyOn(svc as any, 'canManageEventAsOwner').mockResolvedValue(true);
    const canManage = jest.spyOn(svc, 'canManageEvent').mockResolvedValue(false);
    await expect(svc.attachSubEvent('u-1', 'parent', 'child')).rejects.toBeInstanceOf(ForbiddenException);
    expect(canManage).toHaveBeenCalledWith('u-1', 'sp-2', 'parent');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('space structure (J10)', () => {
  function spaces(opts: { admin?: boolean; spaces?: Record<string, { id: string; type: string; parentSpaceId: string | null }> } = {}) {
    const rows = opts.spaces ?? { 'sp-1': { id: 'sp-1', type: 'REGULAR', parentSpaceId: null } };
    const prisma: any = {
      space: {
        findUnique: jest.fn(async ({ where }: any) => rows[where.id] ?? null),
        count: jest.fn(async () => 0),
        update: jest.fn(async () => ({})),
      },
      userRole: { count: jest.fn(async ({ where }: any) => (where.role?.code === 'ADMIN' ? (opts.admin ? 1 : 0) : 0)) },
    };
    return { svc: new SpacesService(prisma, {} as any, {} as any, {} as any, {} as any), prisma };
  }

  it.each([{ type: 'SUPER' }, { parentSpaceId: 'sp-9' }, { coCuratorLimit: 50 }])(
    'a Space Admin cannot set %o through PATCH /spaces/:id',
    async (dto) => {
      const { svc, prisma } = spaces();
      await expect(svc.updateSpace('sp-1', dto as any, 'space-admin')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.space.update).not.toHaveBeenCalled();
    },
  );

  it('a Space Admin can still edit the profile', async () => {
    const { svc, prisma } = spaces();
    await svc.updateSpace('sp-1', { name: 'New' } as any, 'space-admin');
    expect(prisma.space.update).toHaveBeenCalled();
  });

  it('a platform admin cannot re-parent a space under its own descendant', async () => {
    const { svc, prisma } = spaces({
      admin: true,
      spaces: {
        'sp-1': { id: 'sp-1', type: 'SUPER', parentSpaceId: null },
        'sp-2': { id: 'sp-2', type: 'SUPER', parentSpaceId: 'sp-1' },
      },
    });
    await expect(svc.updateSpace('sp-1', { parentSpaceId: 'sp-2' } as any, 'padmin')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.space.update).not.toHaveBeenCalled();
  });

  it('only a Space Admin of an involved space files a sub-space request', async () => {
    const { svc } = spaces();
    await expect(
      svc.createSubSpaceRequest('stranger', { requestType: 'JOIN_SUPER', subSpaceId: 'sp-1', targetSpaceId: 'sp-2' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the analytics subtree walk is cycle-safe, depth-bounded and time-boxed', async () => {
    const tx: any = { $executeRaw: jest.fn(async () => 0), $queryRaw: jest.fn(async () => []) };
    const { svc, prisma } = spaces();
    prisma.$transaction = jest.fn(async (cb: any) => cb(tx));
    await svc.getSubspaceAnalytics('sp-1');
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toContain('statement_timeout');
    const sql: string = tx.$queryRaw.mock.calls[0][0].strings.join('?');
    expect(sql).toContain('<> ALL(st.path)');
    expect(sql).toMatch(/st\.depth < \?/);
  });
});
