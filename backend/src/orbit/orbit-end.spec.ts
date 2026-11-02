import { OrbitService } from './orbit.service';

/** S64 item 10: ending a Lead who created the campus space must not throw. */
describe('OrbitService.end', () => {
  const setup = (createdBy: string, role: 'LEAD' | 'CREW' = 'LEAD') => {
    const prisma: any = {
      orbitLead: {
        findUnique: jest.fn(async () => ({ id: 'ol-1', spaceId: 'sp-1', userId: 'lead', role, endedAt: null, space: { createdBy } })),
        update: jest.fn(async ({ data }: any) => ({ id: 'ol-1', ...data })),
      },
      userRole: { findMany: jest.fn(async () => [{ id: 'ur-1' }]) },
    };
    const spaces: any = { removeSpaceMember: jest.fn(async () => ({})) };
    const svc = new OrbitService(prisma, {} as any, spaces, {} as any);
    return { svc, prisma, spaces };
  };

  it('removes campus admin access from a Lead who did not create the space', async () => {
    const { svc, spaces, prisma } = setup('someone-else');
    await svc.end('ol-1', 'inactive', 'admin');
    expect(spaces.removeSpaceMember).toHaveBeenCalledWith('sp-1', 'ur-1', 'admin');
    expect(prisma.orbitLead.update).toHaveBeenCalled();
  });

  it('ends the term but keeps access for a Lead who created the space', async () => {
    const { svc, spaces, prisma } = setup('lead');
    const out = await svc.end('ol-1', 'inactive', 'admin');
    expect(spaces.removeSpaceMember).not.toHaveBeenCalled();
    expect(out.endedAt).toBeInstanceOf(Date);
    expect(prisma.orbitLead.update).toHaveBeenCalled();
  });

  it('leaves Crew memberships alone', async () => {
    const { svc, spaces } = setup('someone-else', 'CREW');
    await svc.end('ol-1', undefined, 'admin');
    expect(spaces.removeSpaceMember).not.toHaveBeenCalled();
  });
});
