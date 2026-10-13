import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Action } from './actions';
import { CAN_ACTION_KEY } from './can.decorator';
import { CertificatesService } from '../../certificates/certificates.service';
import { ReportsService } from '../../reports/reports.service';
import { RefundsService } from '../../refunds/refunds.service';
import { StaysController } from '../../stays/stays.controller';

/**
 * S23: certificates, reports and refunds ask the IAM instead of hand-rolling a
 * Space Admin role check (which refused platform admins and event curators).
 * S30: marking a stay paid is not a check-in permission.
 */

const event = { id: 'ev-1', spaceId: 'sp-1', title: 'Fest', slug: 'fest', endDateTime: null, space: { name: 'S' } };

function withAuthz<T>(proto: object, allow: (action: Action) => boolean, extra: Record<string, unknown> = {}) {
  const s = Object.create(proto);
  const userRole = { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) };
  Object.assign(s, {
    prisma: { event: { findUnique: jest.fn(async () => event), findMany: jest.fn(async () => [{ id: 'ev-1' }]) }, userRole },
    authz: { can: jest.fn(async (_u: unknown, action: Action) => allow(action)) },
    ...extra,
  });
  return s as T & { authz: { can: jest.Mock } };
}

describe('certificates / reports / refunds use the IAM (S23)', () => {
  it('an event curator (no space role) may manage certificates', async () => {
    const s = withAuthz<any>(CertificatesService.prototype, (a) => a === Action.EVENT_EDIT);
    s.spaceHasCertificatesPlan = jest.fn(async () => true);
    await expect(s.assertCanManage('ev-1', 'curator')).resolves.toBeDefined();
    expect(s.authz.can).toHaveBeenCalledWith({ id: 'curator' }, Action.EVENT_EDIT, { eventId: 'ev-1' });
  });

  it('someone the IAM refuses cannot manage certificates', async () => {
    const s = withAuthz<any>(CertificatesService.prototype, () => false);
    await expect(s.assertCanManage('ev-1', 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reports (they carry revenue) need the money capability', async () => {
    const s = withAuthz<any>(ReportsService.prototype, (a) => a === Action.EVENT_MANAGE_MONEY);
    s.spaceHasAnalyticsPlan = jest.fn(async () => true);
    await expect(s.assertCanManage('ev-1', 'curator')).resolves.toBeDefined();

    const crew = withAuthz<any>(ReportsService.prototype, (a) => a === Action.EVENT_EDIT);
    crew.spaceHasAnalyticsPlan = jest.fn(async () => true);
    await expect(crew.assertCanManage('ev-1', 'co-curator')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("an event's curator sees that event's refund requests", async () => {
    const s = withAuthz<any>(RefundsService.prototype, (a) => a === Action.EVENT_MANAGE_MONEY);
    s.prisma.userRole.findMany.mockResolvedValue([{ spaceId: 'sp-1', eventId: 'ev-1' }]);
    await expect(s.organiserEventIds('curator')).resolves.toEqual(['ev-1']);
    expect(s.prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: [{ spaceId: { in: [] } }, { id: { in: ['ev-1'] } }] }) }),
    );
  });

  it('a space role without the money capability sees no refund requests', async () => {
    const s = withAuthz<any>(RefundsService.prototype, () => false);
    s.prisma.userRole.findMany.mockResolvedValue([{ spaceId: 'sp-1', eventId: null }]);
    await expect(s.organiserEventIds('member')).resolves.toEqual([]);
  });
});

describe('stay mark-paid permission (S30)', () => {
  it('needs attendee management, not check-in', () => {
    const action = Reflect.getMetadata(CAN_ACTION_KEY, StaysController.prototype.markPaid);
    expect(action).toBe(Action.EVENT_MANAGE_ATTENDEES);
  });
});
