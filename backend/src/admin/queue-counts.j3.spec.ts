import { AdminService } from './admin.service';

// J3: one call returns every Apex queue count, as COUNT queries, no row loads.
describe('AdminService.getQueueCounts', () => {
  it('counts each queue without loading rows', async () => {
    const models = [
      'spaceRequest', 'spaceStatusRequest', 'spaceOwnershipRequest', 'subSpaceRequest',
      'registrationTransferRequest', 'freeAttendeeAddRequest', 'whiteLabelRequest',
      'refundRequest', 'payout', 'contentReport',
    ];
    const prisma: Record<string, { count: jest.Mock; findMany: jest.Mock }> = {};
    models.forEach((m, i) => (prisma[m] = { count: jest.fn().mockResolvedValue(i + 1), findMany: jest.fn() }));
    const config = { get: () => 'ap-south-1' };
    const svc = new AdminService(prisma as any, {} as any, {} as any, config as any, {} as any, {} as any, {} as any);

    const res = await svc.getQueueCounts();

    expect(res).toEqual({
      requests: { space: 1, status: 2, ownership: 3, subspace: 4, transfer: 5, 'free-add': 6, 'white-label': 7 },
      refunds: 8,
      payouts: 9,
      reports: 10,
    });
    for (const m of models) expect(prisma[m].findMany).not.toHaveBeenCalled();
    expect(prisma.refundRequest.count).toHaveBeenCalledWith({ where: { status: 'PENDING_ADMIN' } });
  });
});
