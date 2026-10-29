import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrgPlan } from '@prisma/client';
import { PlanConfigService } from '../subscription/plan-config.service';
import { SponsorsService } from './sponsors.service';
import { SponsorPortalService } from './sponsor-portal.service';
import { LeadsService } from './leads.service';

/**
 * E10: the sponsor roster, attendee opt-in, the booth scan and the curator's
 * lead funnel. Each test's prisma is a hand mock: the rules under test are the
 * plan gate (Growth and up, no free pass without a subscription), tenancy
 * (nothing reaches another space's rows) and consent (what an attendee shares).
 */
const mockPrisma = (plan: OrgPlan | null, over: Record<string, any> = {}): any => ({
  orgSubscription: { findUnique: jest.fn(async () => (plan ? { plan } : null)) },
  space: { findUnique: jest.fn(async () => ({ id: 'sp-1' })) },
  event: { findFirst: jest.fn(async () => ({ id: 'ev-1' })), findUnique: jest.fn(async () => ({ slug: 'ev' })) },
  sponsor: {
    findFirst: jest.fn(async ({ where }: any) => (where.spaceId === 'sp-1' && where.id === 's-1' ? { id: 's-1' } : null)),
    create: jest.fn(async ({ data }: any) => ({ id: 's-new', ...data })),
    update: jest.fn(),
    delete: jest.fn(),
  },
  sponsorTier: { findFirst: jest.fn(async ({ where }: any) => (where.id === 't-1' && where.spaceId === 'sp-1' ? { id: 't-1' } : null)) },
  eventSponsor: {
    findFirst: jest.fn(async () => ({ id: 'es-1', eventId: 'ev-1', leadCaptureEnabled: true, event: { spaceId: 'sp-1' } })),
    findMany: jest.fn(async () => []),
    create: jest.fn(async ({ data }: any) => ({ id: 'es-new', ...data })),
  },
  eventRegistration: { findFirst: jest.fn(async () => ({ id: 'reg-1', userId: 'u-1' })) },
  user: {
    findUnique: jest.fn(async () => ({ fullName: 'Ana', mobileNumber: '+91 90000 00000', identities: [{ email: 'ana@x.io' }] })),
  },
  sponsorLead: {
    upsert: jest.fn(async ({ create }: any) => ({ id: 'sl-1', name: create.name, email: create.email })),
    deleteMany: jest.fn(async () => ({ count: 1 })),
    findMany: jest.fn(async () => [{ eventSponsorId: 'es-1' }]),
  },
  sponsorUser: { findUnique: jest.fn(async () => ({ status: 'ACTIVE' })) },
  lead: {
    findFirst: jest.fn(async ({ where }: any) => (where.spaceId === 'sp-1' ? { id: where.id } : null)),
    findMany: jest.fn(async () => []),
    update: jest.fn(async ({ data }: any) => data),
    delete: jest.fn(),
  },
  ...over,
});

const cache = { invalidateEventCache: jest.fn() };
const email = { sendCollaboratorInvite: jest.fn(async () => true) };
const sponsors = (prisma: any) => new SponsorsService(prisma, new PlanConfigService(prisma), cache as any, {} as any, email as any);
const portal = (prisma: any) => new SponsorPortalService(prisma, new PlanConfigService(prisma));

describe('sponsor roster', () => {
  it('needs Growth or up, and no subscription row is not a free pass', async () => {
    for (const plan of [null, OrgPlan.STARTER, OrgPlan.CLUB]) {
      const prisma = mockPrisma(plan);
      await expect(sponsors(prisma).createSponsor('sp-1', { name: 'Acme' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.sponsor.create).not.toHaveBeenCalled();
    }
    const prisma = mockPrisma(OrgPlan.GROWTH);
    await expect(sponsors(prisma).createSponsor('sp-1', { name: 'Acme' })).resolves.toMatchObject({ spaceId: 'sp-1', name: 'Acme' });
  });

  it("never touches another space's sponsor or tier", async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    const svc = sponsors(prisma);
    await expect(svc.updateSponsor('sp-2', 's-1', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteSponsor('sp-2', 's-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.attachSponsor('sp-1', 'ev-1', { sponsorId: 's-other' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.attachSponsor('sp-1', 'ev-1', { sponsorId: 's-1', tierId: 't-other' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sponsor.update).not.toHaveBeenCalled();
    expect(prisma.sponsor.delete).not.toHaveBeenCalled();
    expect(prisma.eventSponsor.create).not.toHaveBeenCalled();
  });

  it('attaching checks the event is in the space and busts its public cache', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    await sponsors(prisma).attachSponsor('sp-1', 'ev-1', { sponsorId: 's-1', tierId: 't-1', leadCaptureEnabled: true });
    expect(prisma.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'ev-1', spaceId: 'sp-1', deletedAt: null });
    expect(prisma.eventSponsor.create.mock.calls[0][0].data).toMatchObject({ sponsorId: 's-1', tierId: 't-1', leadCaptureEnabled: true });
    expect(cache.invalidateEventCache).toHaveBeenCalledWith('ev');
  });
});

describe('attendee opt-in', () => {
  it('shares a snapshot of the attendee once, as OPT_IN', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    await expect(sponsors(prisma).optIn('u-1', 'ev-1', 'es-1')).resolves.toEqual({ optedIn: true, leadId: 'sl-1' });
    const args = prisma.sponsorLead.upsert.mock.calls[0][0];
    expect(args.update).toEqual({});
    expect(args.create).toMatchObject({ source: 'OPT_IN', registrationId: 'reg-1', email: 'ana@x.io', phone: '+91 90000 00000' });
  });

  it('refuses when the sponsor is not collecting, the caller has no ticket, or the plan lapsed', async () => {
    const off = mockPrisma(OrgPlan.GROWTH);
    off.eventSponsor.findFirst.mockResolvedValueOnce({ id: 'es-1', leadCaptureEnabled: false, event: { spaceId: 'sp-1' } });
    await expect(sponsors(off).optIn('u-1', 'ev-1', 'es-1')).rejects.toThrow('This sponsor is not collecting leads.');

    const noTicket = mockPrisma(OrgPlan.GROWTH);
    noTicket.eventRegistration.findFirst.mockResolvedValueOnce(null);
    await expect(sponsors(noTicket).optIn('u-1', 'ev-1', 'es-1')).rejects.toBeInstanceOf(ForbiddenException);

    const lapsed = mockPrisma(OrgPlan.CLUB);
    await expect(sponsors(lapsed).optIn('u-1', 'ev-1', 'es-1')).rejects.toBeInstanceOf(ForbiddenException);
    for (const p of [off, noTicket, lapsed]) expect(p.sponsorLead.upsert).not.toHaveBeenCalled();
  });

  it('withdraw and "my opt-ins" only ever touch OPT_IN leads, never a booth scan', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    const svc = sponsors(prisma);
    await svc.withdrawOptIn('u-1', 'ev-1', 'es-1');
    expect(prisma.sponsorLead.deleteMany.mock.calls[0][0].where).toEqual({ eventSponsorId: 'es-1', registrationId: 'reg-1', source: 'OPT_IN' });
    await expect(svc.listMyOptIns('u-1', 'ev-1')).resolves.toEqual(['es-1']);
    expect(prisma.sponsorLead.findMany.mock.calls[0][0].where.source).toBe('OPT_IN');
  });
});

describe('booth scan', () => {
  const dto = { eventSponsorId: 'es-1', qrCode: ' QR-1 ', attendeeConsent: true };

  it('is for members of the sponsor only', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    prisma.sponsorUser.findUnique.mockResolvedValueOnce({ status: 'REVOKED' });
    await expect(portal(prisma).boothScan('u-9', 's-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.sponsorLead.upsert).not.toHaveBeenCalled();
  });

  it('only a ticket that still counts at this event becomes a BOOTH_SCAN lead', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    await expect(portal(prisma).boothScan('u-9', 's-1', dto)).resolves.toMatchObject({ captured: true, lead: { id: 'sl-1' } });
    const where = prisma.eventRegistration.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ qrCode: 'QR-1', eventId: 'ev-1', status: { not: 'CANCELLED' }, isWaitlisted: false });
    expect(prisma.sponsorLead.upsert.mock.calls[0][0].create).toMatchObject({ source: 'BOOTH_SCAN', capturedBy: 'u-9' });

    const gone = mockPrisma(OrgPlan.GROWTH);
    gone.eventRegistration.findFirst.mockResolvedValueOnce(null);
    await expect(portal(gone).boothScan('u-9', 's-1', dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('takes no new leads once the space is below Growth', async () => {
    const prisma = mockPrisma(OrgPlan.STARTER);
    await expect(portal(prisma).boothScan('u-9', 's-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventRegistration.findFirst).not.toHaveBeenCalled();
  });
});

describe('curator lead funnel', () => {
  const leads = (prisma: any) => new LeadsService(prisma, new PlanConfigService(prisma), { emit: jest.fn() } as any);

  it("can't edit or delete another space's lead", async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    const svc = leads(prisma);
    await expect(svc.updateLead('sp-2', 'lead-1', { status: 'CONTACTED' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteLead('sp-2', 'lead-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(prisma.lead.delete).not.toHaveBeenCalled();
  });

  it('a manual lead is tied only to an event in the same space', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH);
    prisma.event.findFirst.mockResolvedValueOnce(null);
    await expect(leads(prisma).createLead('sp-1', { email: 'a@b.co', eventId: 'ev-x' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.event.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'ev-x', spaceId: 'sp-1' });
  });
});

describe('sponsor portal invite (E1)', () => {
  it('invites by email without revealing whether they have an account, and emails them', async () => {
    const prisma = mockPrisma(OrgPlan.GROWTH, {
      userIdentity: { findMany: jest.fn(async () => []) },
      user: { create: jest.fn(async () => ({ id: 'new-user' })), findUnique: jest.fn(async () => ({ fullName: 'Curator' })) },
      space: { findUnique: jest.fn(async () => ({ id: 'sp-1', name: 'Robotics Club' })) },
      sponsorUser: { create: jest.fn(async ({ data }: any) => ({ id: 'su-1', ...data })) },
    });
    prisma.sponsor.findFirst = jest.fn(async () => ({ id: 's-1', name: 'Acme' }));
    email.sendCollaboratorInvite.mockClear();

    await expect(sponsors(prisma).inviteSponsorUser('sp-1', 's-1', 'Rep@Acme.com', 'cur-1')).resolves.toMatchObject({ id: 'su-1' });
    expect(prisma.sponsorUser.create.mock.calls[0][0].data).toMatchObject({ userId: 'new-user', status: 'INVITED', invitedEmail: 'rep@acme.com' });
    expect(email.sendCollaboratorInvite).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'rep@acme.com', target: 'Acme at Robotics Club', url: 'https://space.unifesto.app/sponsor' }),
      expect.objectContaining({ dedupKey: 'invite.sponsor:su-1' }),
    );
  });
});
