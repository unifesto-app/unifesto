import { PlatformConfigService } from './platform-config.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The post-event action window — the shared deadline that closes certificate
 * issuance and attendee import/add some days after an event ends. Exercises the
 * pure date math and the open/closed boundary against the admin-set day count.
 */
describe('PlatformConfigService — post-event action window', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  /** A service whose cached window is `days`, loaded via a stubbed upsert. */
  async function serviceWithWindow(days: number): Promise<PlatformConfigService> {
    const prisma = {
      platformConfig: {
        upsert: jest.fn().mockResolvedValue({
          processingFeePercent: 0,
          postEventActionWindowDays: days,
          iosLatestVersion: '2.0.1',
          iosMinimumVersion: '0.0.0',
          iosStoreUrl: '',
          androidLatestVersion: '2.0.1',
          androidMinimumVersion: '0.0.0',
          androidStoreUrl: '',
        }),
      },
    } as unknown as PrismaService;
    const svc = new PlatformConfigService(prisma);
    await svc.reload();
    return svc;
  }

  it('sets the deadline to event end + the configured days', async () => {
    const svc = await serviceWithWindow(7);
    const end = new Date('2026-08-01T10:00:00.000Z');
    expect(svc.postEventDeadline(end).toISOString()).toBe(
      '2026-08-08T10:00:00.000Z',
    );
  });

  it('is open before the deadline and closed after it', async () => {
    const svc = await serviceWithWindow(7);
    const now = Date.now();

    // Ended 6 days ago → 1 day of window left → open.
    expect(svc.isWithinPostEventWindow(new Date(now - 6 * DAY_MS))).toBe(true);
    // Ended 8 days ago → window elapsed → closed.
    expect(svc.isWithinPostEventWindow(new Date(now - 8 * DAY_MS))).toBe(false);
  });

  it('a 0-day window closes actions the moment the event ends', async () => {
    const svc = await serviceWithWindow(0);
    // Ended a second ago → already closed.
    expect(svc.isWithinPostEventWindow(new Date(Date.now() - 1000))).toBe(false);
    // Ends in the future → still open.
    expect(svc.isWithinPostEventWindow(new Date(Date.now() + 1000))).toBe(true);
  });

  it('exposes the configured day count for messaging', async () => {
    const svc = await serviceWithWindow(14);
    expect(svc.getPostEventActionWindowDays()).toBe(14);
  });
});
