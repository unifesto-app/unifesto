import { ForbiddenException } from '@nestjs/common';
import { OrgPlan, SupportTicketPriority } from '@prisma/client';
import { PlanConfigService } from './plan-config.service';
import { PLAN_LIMITS, PlanLimits } from './plan-limits.config';
import { PLAN_FULL, SoldOutError, takeSeats } from '../registrations/capacity.util';
import { EventsService } from '../events/events.service';
import { LeadsService } from '../sponsors/leads.service';
import { SpacesService } from '../spaces/spaces.service';
import { SupportService } from '../support/support.service';

/** A prisma whose space `sp-1` is on `plan` (null = no subscription row). */
const onPlan = (plan: OrgPlan | null, extra: Record<string, unknown> = {}) => ({
  orgSubscription: { findUnique: jest.fn(async () => (plan ? { plan } : null)) },
  ...extra,
});

/** T9: every plan switch and limit the plan pages list is enforced server side. */
describe('plan enforcement (T9)', () => {
  describe('PlanConfigService', () => {
    it('a space with no subscription row, or a lapsed plan, reads as General', async () => {
      expect((await new PlanConfigService(onPlan(null) as any).spaceLimits('sp-1')).plan).toBe(OrgPlan.STARTER);
      const lapsed = { orgSubscription: { findUnique: async () => ({ plan: OrgPlan.PRO, expiresAt: new Date(2020, 0, 1) }) } };
      expect((await new PlanConfigService(lapsed as any).spaceLimits('sp-1')).plan).toBe(OrgPlan.STARTER);
    });

    it('assertFeature names the cheapest plan that has it', async () => {
      const svc = new PlanConfigService(onPlan(OrgPlan.STARTER) as any);
      await expect(svc.assertFeature('sp-1', 'hasCertificates')).rejects.toThrow(
        'Not on the General plan: Certificates. It comes with Club and up.',
      );
      await expect(svc.assertFeature('sp-1', 'hasLeaderboard')).rejects.toThrow('It comes with Growth and up.');
      await expect(new PlanConfigService(onPlan(OrgPlan.CLUB) as any).assertFeature('sp-1', 'hasCertificates')).resolves.toBeUndefined();
    });

    it('assertLimit passes up to the limit, and null is unlimited', async () => {
      const club = new PlanConfigService(onPlan(OrgPlan.CLUB) as any);
      await expect(club.assertLimit('sp-1', 'coCurators', 4, ['x', 'xs'])).resolves.toBeUndefined();
      await expect(club.assertLimit('sp-1', 'coCurators', 5, ['x', 'xs'])).rejects.toBeInstanceOf(ForbiddenException);
      const enterprise = new PlanConfigService(onPlan(OrgPlan.ENTERPRISE) as any);
      await expect(enterprise.assertLimit('sp-1', 'coCurators', 999, ['x', 'xs'])).resolves.toBeUndefined();
    });
  });

  describe('attendees per event (takeSeats)', () => {
    it('refuses once the event is at its plan cap, after the ticket take', async () => {
      // Ticket seat taken (1 row), event count refused by the plan cap (0 rows).
      const tx: any = { $executeRaw: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0) };
      const take = takeSeats(tx, { eventId: 'ev-1', ticketTypeId: 'tt-1' }, 2);
      await expect(take).rejects.toBeInstanceOf(SoldOutError);
      // No ticket type: only the event count runs, and the plan refuses it.
      await expect(takeSeats({ $executeRaw: jest.fn(async () => 0) } as any, { eventId: 'ev-1' }, 1)).rejects.toThrow(PLAN_FULL);
      const sql = tx.$executeRaw.mock.calls[1][0].join('?');
      expect(sql).toContain('UPDATE events');
      expect(sql).toContain('attendees_per_event');
    });

    it('takes and counts when the plan has room', async () => {
      const tx: any = { $executeRaw: jest.fn(async () => 1) };
      await expect(takeSeats(tx, { eventId: 'ev-1', ticketTypeId: 'tt-1' }, 1)).resolves.toBeUndefined();
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  describe('events', () => {
    /** Events on `plan`; `limits` overrides its flags (to gate a switch every plan now has). */
    const events = (plan: OrgPlan, limits: Partial<PlanLimits> = {}) => {
      const prisma: any = onPlan(plan, {
        space: { findUnique: jest.fn(async () => ({ id: 'sp-1', status: 'ACTIVE' })) },
        event: { findUnique: jest.fn(async () => ({ id: 'ev-1', spaceId: 'sp-1', status: 'PUBLISHED', waitlistEnabled: false, space: { subscription: { plan } }, ticketTypes: [] })) },
        eventTicketType: { findUnique: jest.fn(async () => ({ id: 'tt-1', eventId: 'ev-1', kind: 'INDIVIDUAL', waitlistEnabled: false, totalQuantity: 10 })) },
      });
      const planConfig = new PlanConfigService(prisma);
      jest.spyOn(planConfig, 'getLimits').mockImplementation((p) => ({ ...PLAN_LIMITS[p], ...limits }));
      const svc = new EventsService(prisma, {} as any, {} as any, {} as any, {} as any, planConfig, {} as any, {} as any);
      jest.spyOn(svc, 'canManageEvent').mockResolvedValue(true);
      return svc;
    };

    it('a waiting list is gated on a new event, a new ticket, or switched on later', async () => {
      const svc = events(OrgPlan.STARTER, { hasWaitlist: false });
      await expect(svc.createEvent('u', { spaceId: 'sp-1', waitlistEnabled: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.createTicketType('u', 'ev-1', { kind: 'INDIVIDUAL', price: 0, totalQuantity: 10, waitlistEnabled: true } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.updateTicketType('u', 'ev-1', 'tt-1', { waitlistEnabled: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(svc.updateEvent('u', 'ev-1', { waitlistEnabled: true } as any)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('the leads funnel needs sponsors (Growth)', async () => {
    const prisma: any = onPlan(OrgPlan.CLUB, { lead: { findMany: jest.fn(async () => []) } });
    const leads = new LeadsService(prisma, new PlanConfigService(prisma), { emit: jest.fn() } as any);
    await expect(leads.listLeads('sp-1', {})).rejects.toThrow('Not on the Club plan: Sponsors and lead capture.');
    expect(prisma.lead.findMany).not.toHaveBeenCalled();
  });

  it('a space and its sub-spaces count toward the plan (Growth: 5)', async () => {
    const withChildren = (n: number) => {
      const prisma: any = onPlan(OrgPlan.GROWTH, { space: { count: jest.fn(async () => n) } });
      return new SpacesService(prisma, {} as any, {} as any, {} as any, new PlanConfigService(prisma));
    };
    await expect((withChildren(3) as any).assertRoomForSubSpace('sp-1')).resolves.toBeUndefined();
    await expect((withChildren(4) as any).assertRoomForSubSpace('sp-1')).rejects.toThrow(
      'The Growth plan allows 5 spaces, counting sub-spaces. Pro allows more.',
    );
  });

  describe('priority support', () => {
    const create = async (plan: OrgPlan, operator = true) => {
      const prisma: any = onPlan(plan, {
        space: { findUnique: jest.fn(async () => ({ id: 'sp-1' })) },
        supportTicket: { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 't-1', ...data })) },
      });
      const authz: any = { can: jest.fn(async () => operator) };
      const svc = new SupportService(prisma, authz, {} as any, { emit: jest.fn() } as any, new PlanConfigService(prisma));
      return svc.createTicket({ subject: 'Payout', message: 'Help', spaceId: 'sp-1' } as any, 'u-1');
    };

    it("a Space Admin's case to Unifesto opens at HIGH on a plan with it", async () => {
      expect((await create(OrgPlan.GROWTH)).priority).toBe(SupportTicketPriority.HIGH);
    });

    it('stays NORMAL on a plan without it', async () => {
      expect((await create(OrgPlan.CLUB)).priority).toBe(SupportTicketPriority.NORMAL);
    });
  });
});
