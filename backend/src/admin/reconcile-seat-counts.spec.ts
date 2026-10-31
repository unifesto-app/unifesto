import { AdminService } from './admin.service';

describe('AdminService.reconcileSeatCounts', () => {
  it('counts held waiting list offers toward soldCount but not registeredCount', async () => {
    const exec = jest.fn((sql: string) => sql);
    const prisma = { $executeRawUnsafe: exec, $transaction: jest.fn(async (ops) => ops.map(() => 1)) };
    const config = { get: () => 'ap-south-1' };
    const svc = new AdminService(prisma as any, {} as any, {} as any, config as any, {} as any, {} as any, {} as any);

    await svc.reconcileSeatCounts();

    const soldSql = exec.mock.calls.map(([s]) => s).find((s) => s.includes('SET sold_count = sub.seats'))!;
    const regSql = exec.mock.calls.map(([s]) => s).find((s) => s.includes('SET registered_count = sub.seats'))!;
    expect(soldSql).toContain("waitlist_status = 'OFFERED'");
    expect(regSql).not.toContain('OFFERED');
  });
});
