import { RETENTION, RetentionService } from './retention.service';

describe('RetentionService.pruneAll', () => {
  it('deletes in chunks until a short chunk, per table, with that table cutoff', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce(5000) // api_logs: full chunk, go again
      .mockResolvedValueOnce(12)
      .mockResolvedValue(0);
    const svc = new RetentionService({ $executeRawUnsafe: exec } as any, {} as any);
    const now = new Date('2026-10-15T00:00:00Z');

    const pruned = await svc.pruneAll(now);

    expect(pruned.api_logs).toBe(5012);
    expect(exec).toHaveBeenCalledTimes(RETENTION.length + 1);
    const [sql, cutoff] = exec.mock.calls[0];
    expect(sql).toContain('DELETE FROM "api_logs"');
    expect(cutoff).toEqual(new Date(now.getTime() - 180 * 86_400_000));
  });

  it('honours a per-table env override', async () => {
    process.env.RETENTION_DAYS_PUSH_LOGS = '30';
    try {
      const exec = jest.fn().mockResolvedValue(0);
      const svc = new RetentionService({ $executeRawUnsafe: exec } as any, {} as any);
      const now = new Date('2026-10-15T00:00:00Z');
      await svc.pruneAll(now);
      const call = exec.mock.calls.find(([sql]) => sql.includes('"push_logs"'))!;
      expect(call[1]).toEqual(new Date(now.getTime() - 30 * 86_400_000));
    } finally {
      delete process.env.RETENTION_DAYS_PUSH_LOGS;
    }
  });
});
