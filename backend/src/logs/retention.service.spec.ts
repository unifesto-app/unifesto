import { PERSONAL_DATA_RETENTION_DAYS, RETENTION, RetentionService } from './retention.service';

const DAY = 86_400_000;

function build(exec = jest.fn().mockResolvedValue(0), query = jest.fn().mockResolvedValue([])) {
  const storage = { deleteObject: jest.fn(), deletePrefix: jest.fn().mockResolvedValue(1) };
  const svc = new RetentionService(
    { $executeRawUnsafe: exec, $queryRawUnsafe: query } as any,
    {} as any,
    storage as any,
  );
  return { svc, exec, query, storage };
}

describe('RetentionService.pruneAll', () => {
  const now = new Date('2026-10-15T00:00:00Z');

  it('deletes in chunks until a short chunk, per table, with that table cutoff', async () => {
    const exec = jest
      .fn()
      .mockResolvedValueOnce(5000) // api_logs: full chunk, go again
      .mockResolvedValueOnce(12)
      .mockResolvedValue(0);
    const { svc } = build(exec);

    const pruned = await svc.pruneAll(now);

    expect(pruned.api_logs).toBe(5012);
    const [sql, cutoff] = exec.mock.calls[0];
    expect(sql).toContain('DELETE FROM "api_logs"');
    expect(cutoff).toEqual(new Date(now.getTime() - 180 * DAY));
    // Every append-only table still runs (CERT-In api_logs at 180d untouched).
    for (const { table } of RETENTION) expect(pruned).toHaveProperty(table);
    expect(RETENTION.find((r) => r.table === 'api_logs')!.days).toBe(180);
  });

  it('honours a per-table env override', async () => {
    process.env.RETENTION_DAYS_PUSH_LOGS = '30';
    try {
      const { svc, exec } = build();
      await svc.pruneAll(now);
      const call = exec.mock.calls.find(([sql]) => sql.includes('"push_logs"'))!;
      expect(call[1]).toEqual(new Date(now.getTime() - 30 * DAY));
    } finally {
      delete process.env.RETENTION_DAYS_PUSH_LOGS;
    }
  });
});

describe('RetentionService personal-data sweeps (I5)', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  const cutoffFor = (days: number) => new Date(now.getTime() - days * DAY);

  it('the policy values are the documented defaults', () => {
    expect(PERSONAL_DATA_RETENTION_DAYS).toEqual({
      REGISTRATION_ANSWERS: 730,
      GUEST_DETAILS: 730,
      LEADS: 730,
      CLOSED_SUPPORT_THREADS: 1095,
      RESUMES: 365,
      WHATSAPP_THREADS: 365,
    });
  });

  it('dry run only counts, per sweep, and changes nothing', async () => {
    const query = jest.fn(async (sql: string, _cutoff?: Date) => [{ n: BigInt(sql.includes('"leads"') ? 7 : 0) }]);
    const { svc, exec, storage } = build(jest.fn(), query);

    const counts = await svc.pruneAll(now, { dryRun: true });

    expect(exec).not.toHaveBeenCalled();
    expect(storage.deleteObject).not.toHaveBeenCalled();
    expect(storage.deletePrefix).not.toHaveBeenCalled();
    expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT count(*)'))).toBe(true);
    expect(counts['LEADS:leads']).toBe(7);
    expect(counts['RESUMES:career_applications']).toBe(0);
    expect(counts.api_logs).toBe(0);
    const leads = query.mock.calls.find(([sql]) => sql.includes('"leads"'))!;
    expect(leads[1]).toEqual(cutoffFor(730));
  });

  it('scrubs registration answers and guest details of ended events in place', async () => {
    const { svc, exec } = build();
    await svc.pruneAll(now);
    const sql = (table: string) => exec.mock.calls.find(([s]) => s.startsWith(`UPDATE "${table}"`));

    const reg = sql('event_registrations')!;
    expect(reg[0]).toContain('SET form_responses = NULL');
    expect(reg[0]).toContain('end_date_time < $1');
    expect(reg[1]).toEqual(cutoffFor(730));
    expect(sql('stay_bookings')![0]).toContain('emergency_phone = NULL');
    expect(sql('group_seats')![0]).toContain('member_details = NULL');
    expect(sql('event_tickets')![0]).toContain('attendee_email = NULL');
    expect(sql('stay_guests')![0]).toContain("name = 'Erased user'");
  });

  it('deletes old support threads, résumés and WhatsApp threads with their files', async () => {
    const query = jest.fn(async (sql: string, _cutoff?: Date): Promise<Record<string, string>[]> => {
      if (sql.includes('"support_tickets"')) return [{ id: 't1' }];
      if (sql.includes('"career_applications"')) {
        return [{ resume_url: 'private/career-resumes/a.pdf' }, { resume_url: 'https://legacy/x.pdf' }];
      }
      if (sql.includes('"whatsapp_conversations"')) return [{ wa_id: '919876543210' }];
      return [];
    });
    const { svc, storage } = build(jest.fn().mockResolvedValue(0), query);

    const pruned = await svc.pruneAll(now);

    const support = query.mock.calls.find(([s]) => s.includes('"support_tickets"'))!;
    expect(support[0]).toMatch(/^DELETE FROM "support_tickets" .*status IN \('RESOLVED', 'CLOSED'\)/s);
    expect(support[1]).toEqual(cutoffFor(1095));
    expect(query.mock.calls.find(([s]) => s.includes('"career_applications"'))![1]).toEqual(cutoffFor(365));
    expect(pruned['CLOSED_SUPPORT_THREADS:support_tickets']).toBe(1);
    expect(pruned['RESUMES:career_applications']).toBe(2);
    expect(storage.deleteObject.mock.calls).toEqual([['private/career-resumes/a.pdf']]);
    expect(storage.deletePrefix.mock.calls.map((c) => c[0])).toEqual([
      'private/support/t1/',
      'whatsapp-inbox/919876543210/',
      'whatsapp-outbound/919876543210/',
    ]);
  });

  it('honours an override by sweep name', async () => {
    process.env.RETENTION_DAYS_RESUMES = '180';
    try {
      const { svc, query } = build();
      await svc.pruneAll(now);
      expect(query.mock.calls.find(([s]) => s.includes('"career_applications"'))![1]).toEqual(cutoffFor(180));
    } finally {
      delete process.env.RETENTION_DAYS_RESUMES;
    }
  });
});
