import { EventStatus, ReportSection, ReportStatus, ReportType } from '@prisma/client';
import { ReportsService, reportBound } from './reports.service';

/** S33: report PDFs render off the request; interrupted renders get failed. */
describe('ReportsService background generation', () => {
  const build = (gather: jest.Mock, event: Record<string, unknown> = {}) => {
    const prisma: any = {
      event: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'e1',
          spaceId: 's1',
          title: 'Fest',
          type: 'OFFLINE',
          space: { name: 'Space' },
          ...event,
        }),
      },
      userRole: { count: jest.fn().mockResolvedValue(1) },
      eventReport: {
        create: jest.fn().mockResolvedValue({ id: 'r1', status: ReportStatus.PENDING }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const queue = { addReport: jest.fn().mockResolvedValue(false) };
    const render = { renderPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    const storage = {
      uploadPrivate: jest.fn().mockResolvedValue(undefined),
      linkFor: jest.fn(async (v: string | null) => v && `signed:${v}`),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    const ai = { run: jest.fn().mockResolvedValue({ ok: true, text: 'It went well.' }) };
    const svc = new ReportsService(prisma, {} as any, { gather } as any, render as any, storage as any, { can: async () => true } as any, queue as any, ai as any);
    jest.spyOn(svc as any, 'spaceHasAnalyticsPlan').mockResolvedValue(true);
    return { svc, prisma, queue, render, ai, storage };
  };

  it('returns the PENDING row without waiting for the render', async () => {
    const { svc } = build(jest.fn(() => new Promise(() => undefined))); // never settles
    const res = await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    expect(res.status).toBe(ReportStatus.PENDING);
  });

  it('a failed render marks the row FAILED instead of throwing at the caller', async () => {
    const { svc, prisma } = build(jest.fn().mockRejectedValue(new Error('boom')));
    await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    await new Promise((r) => setImmediate(r));
    expect(prisma.eventReport.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: ReportStatus.FAILED, error: 'boom' },
    });
  });

  it('list fails PENDING rows older than the stale window', async () => {
    const { svc, prisma } = build(jest.fn());
    await svc.list('u1', 'e1');
    const arg = prisma.eventReport.updateMany.mock.calls[0][0];
    expect(arg.where.status).toBe(ReportStatus.PENDING);
    expect(arg.data.status).toBe(ReportStatus.FAILED);
  });

  it('stores the PDF privately under its event and signs it on list (J15)', async () => {
    const { svc, prisma, storage } = build(jest.fn().mockResolvedValue({}));
    await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    await new Promise((r) => setImmediate(r));
    expect(storage.uploadPrivate).toHaveBeenCalledWith(expect.any(Buffer), 'private/reports/e1/r1.pdf', 'application/pdf');
    expect(prisma.eventReport.update.mock.calls.at(-1)[0].data.fileUrl).toBe('private/reports/e1/r1.pdf');

    prisma.eventReport.findMany.mockResolvedValue([{ id: 'r1', fileUrl: 'private/reports/e1/r1.pdf', fileName: 'x.pdf' }]);
    const [row] = await svc.list('u1', 'e1');
    expect(storage.linkFor).toHaveBeenCalledWith('private/reports/e1/r1.pdf', 'private/reports/', 3600, 'x.pdf');
    expect(row.fileUrl).toBe('signed:private/reports/e1/r1.pdf');
  });

  it('deleting a report deletes its PDF too (J15)', async () => {
    const { svc, prisma, storage } = build(jest.fn());
    prisma.eventReport.findUnique = jest.fn().mockResolvedValue({ eventId: 'e1', fileUrl: 'private/reports/e1/r1.pdf' });
    prisma.eventReport.delete = jest.fn().mockResolvedValue({});
    await svc.remove('u1', 'r1');
    expect(storage.deleteObject).toHaveBeenCalledWith('private/reports/e1/r1.pdf');
  });

  it('hands the render to the worker queue when there is one (B19)', async () => {
    const gather = jest.fn();
    const { svc, queue } = build(gather);
    queue.addReport.mockResolvedValue(true);
    await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    await new Promise((r) => setImmediate(r));
    expect(queue.addReport).toHaveBeenCalledWith('r1');
    expect(gather).not.toHaveBeenCalled();
  });

  it('returns the report already generating instead of starting another (B19)', async () => {
    const { svc, prisma } = build(jest.fn());
    prisma.eventReport.findFirst.mockResolvedValue({ id: 'r0', status: ReportStatus.PENDING });
    const res = await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
    expect(res.id).toBe('r0');
    expect(prisma.eventReport.create).not.toHaveBeenCalled();
  });

  /** M3: an ended event's report carries an AI summary built from the same gather. */
  describe('post-event summary', () => {
    const ended = {
      status: EventStatus.COMPLETED,
      startDateTime: new Date('2026-10-10T04:30:00Z'),
      endDateTime: new Date('2026-10-10T12:30:00Z'),
      capacity: 100,
    };
    const overview = {
      totalRegistrations: 10, attending: 8, checkedIn: 6, waitlisted: 0, attendanceRate: 75,
      capacityFill: 8, collected: 0, fees: 0, refunded: 0, net: 0,
    };
    const flush = () => new Promise((r) => setImmediate(r));

    it('gathers overview + tickets, prints the summary and stores it', async () => {
      const gather = jest.fn().mockResolvedValue({ overview, tickets: [] });
      const { svc, prisma, render, ai } = build(gather, ended);
      await svc.create('u1', 'e1', { type: ReportType.CUSTOM, sections: [ReportSection.ATTENDEES] } as any);
      await flush();
      expect(gather.mock.calls[0][1]).toEqual([ReportSection.ATTENDEES, ReportSection.OVERVIEW, ReportSection.TICKETS]);
      expect(ai.run).toHaveBeenCalledWith('report_summary', expect.objectContaining({ userId: 'u1', subject: 'report:r1' }));
      expect(ai.run.mock.calls[0][1].messages[0].content).toContain('Free event: no ticket revenue');
      expect(render.renderPdf.mock.calls[0][0]).toMatchObject({ aiSummary: 'It went well.', sections: [ReportSection.ATTENDEES] });
      expect(prisma.eventReport.update.mock.calls[0][0].data).toMatchObject({ status: ReportStatus.READY, aiSummary: 'It went well.' });
    });

    it('a refused or failed summary still yields a READY report without one', async () => {
      const { svc, prisma, ai } = build(jest.fn().mockResolvedValue({ overview, tickets: [] }), ended);
      ai.run.mockResolvedValue({ ok: false, reason: 'refused' });
      await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
      await flush();
      expect(prisma.eventReport.update.mock.calls[0][0].data).toMatchObject({ status: ReportStatus.READY, aiSummary: null, aiSummaryAt: null });
    });

    it('an event still running gets no summary and no AI call', async () => {
      const gather = jest.fn().mockResolvedValue({ overview });
      const { svc, ai } = build(gather, { ...ended, status: EventStatus.PUBLISHED, endDateTime: new Date(Date.now() + 86_400_000) });
      await svc.create('u1', 'e1', { type: ReportType.DEFAULT } as any);
      await flush();
      expect(ai.run).not.toHaveBeenCalled();
    });

    it('regenerate re-renders in place for whoever asked, ended events only', async () => {
      const { svc, prisma, ai } = build(jest.fn().mockResolvedValue({ overview, tickets: [] }), ended);
      prisma.eventReport.findFirst.mockResolvedValue({
        id: 'r1', status: ReportStatus.READY, sections: [ReportSection.OVERVIEW], dateFrom: null, dateTo: null, title: 'T',
      });
      prisma.eventReport.update.mockResolvedValueOnce({ id: 'r1', status: ReportStatus.PENDING });
      const res = await svc.regenerate('u2', 'e1', 'r1');
      expect(res.status).toBe(ReportStatus.PENDING);
      expect(prisma.eventReport.update.mock.calls[0][0].data).toMatchObject({ status: ReportStatus.PENDING, aiSummary: null, generatedBy: 'u2' });
      await flush();
      expect(ai.run.mock.calls[0][1].userId).toBe('u2');

      const live = build(jest.fn(), { ...ended, status: EventStatus.PUBLISHED, endDateTime: new Date(Date.now() + 86_400_000) });
      live.prisma.eventReport.findFirst.mockResolvedValue({ id: 'r1', status: ReportStatus.READY });
      await expect(live.svc.regenerate('u2', 'e1', 'r1')).rejects.toThrow(/event has ended/);
    });
  });

  it('reads a bare date as a whole IST day (B19)', () => {
    expect(reportBound('2026-10-15', false)!.toISOString()).toBe('2026-10-14T18:30:00.000Z');
    expect(reportBound('2026-10-15', true)!.toISOString()).toBe('2026-10-15T18:29:59.999Z');
    expect(reportBound('2026-10-15T10:00:00Z', true)!.toISOString()).toBe('2026-10-15T10:00:00.000Z');
    expect(reportBound(undefined, true)).toBeNull();
  });
});
