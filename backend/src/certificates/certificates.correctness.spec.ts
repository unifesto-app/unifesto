import { CertificateAudience, CertificateBatchStatus, CertificateStatus } from '@prisma/client';
import { CertificatesService } from './certificates.service';
import { scriptFontFor, SCRIPT_FONTS } from './certificate-fonts';

/** B19: certificate correctness at scale. */
function build(prisma: any) {
  return new CertificatesService(
    prisma, {} as any, {} as any, {} as any, {} as any,
    { get: () => undefined } as any, {} as any, { can: async () => true } as any, {} as any,
  );
}

const seat = (seatIndex: number, claimedByUserId: string | null, name: string) => ({
  id: `seat${seatIndex}`,
  seatIndex,
  status: 'CLAIMED',
  memberDetails: { name },
  claimedByUserId,
  claimedBy: null,
});

const groupReg = (checkins: { memberIndex: number; groupSeatId: string | null }[]) => ({
  id: 'reg1',
  userId: 'lead',
  groupSize: 3,
  formResponses: {},
  user: { fullName: 'Lead', identities: [] },
  groupSeats: [seat(1, 'lead', 'Lead'), seat(2, 'u2', 'Two'), seat(3, null, 'Three')],
  groupMemberCheckins: checkins,
});

describe('certificate recipients (B19)', () => {
  const resolve = (reg: any, audience: CertificateAudience) => {
    const prisma = {
      eventRegistration: { findMany: jest.fn().mockResolvedValue([reg]) },
      eventFormField: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return (build(prisma) as any).resolveRecipients('e1', { audience });
  };

  it('CHECKED_IN certifies only the members who were scanned', async () => {
    const people = await resolve(groupReg([{ memberIndex: 1, groupSeatId: 'seat2' }]), CertificateAudience.CHECKED_IN);
    expect(people.map((p: any) => p.name)).toEqual(['Two']);
  });

  it('a group checked in as a whole still certifies everyone', async () => {
    const people = await resolve(groupReg([]), CertificateAudience.CHECKED_IN);
    expect(people).toHaveLength(3);
  });

  it("files each member's certificate under their own account", async () => {
    const people = await resolve(groupReg([]), CertificateAudience.CONFIRMED);
    expect(people.map((p: any) => p.userId)).toEqual(['lead', 'u2', null]);
  });
});

describe('certificate revocation and templates (B19)', () => {
  it('a single revoke is for cause; "Revoke all" is not', async () => {
    const prisma: any = {
      certificate: {
        findUnique: jest.fn().mockResolvedValue({ eventId: 'e1', status: CertificateStatus.ISSUED }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      certificateTemplate: { findUnique: jest.fn().mockResolvedValue({ eventId: 'e1' }) },
    };
    const svc = build(prisma);
    jest.spyOn(svc as any, 'assertCanManage').mockResolvedValue({});
    await svc.revoke('u', 'c1', 'Plagiarism');
    expect(prisma.certificate.update.mock.calls[0][0].data.revokedForCause).toBe(true);
    await svc.revokeAllForTemplate('u', 't1');
    expect(prisma.certificate.updateMany.mock.calls[0][0].data.revokedForCause).toBe(false);
  });

  it('a template with issued certificates is retired, not deleted', async () => {
    const prisma: any = {
      certificateTemplate: {
        findUnique: jest.fn().mockResolvedValue({ eventId: 'e1', _count: { certificates: 5 } }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      certificate: { deleteMany: jest.fn() },
    };
    const svc = build(prisma);
    jest.spyOn(svc as any, 'assertCanManage').mockResolvedValue({});
    await expect(svc.deleteTemplate('u', 't1')).resolves.toMatchObject({ retired: true, certificatesDeleted: 0 });
    expect(prisma.certificate.deleteMany).not.toHaveBeenCalled();
    expect(prisma.certificateTemplate.delete).not.toHaveBeenCalled();
  });

  it('closes batches a crashed worker left hanging', async () => {
    const prisma: any = { certificateBatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await expect(build(prisma).sweepStaleBatches(new Date('2026-10-19T12:00:00Z'))).resolves.toBe(1);
    const arg = prisma.certificateBatch.updateMany.mock.calls[0][0];
    expect(arg.data.status).toBe(CertificateBatchStatus.FAILED);
    expect(arg.where.OR[0].startedAt.lt.toISOString()).toBe('2026-10-19T10:00:00.000Z');
  });

  it('reads the next serial with one aggregate query', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([{ max: 41 }]) };
    await expect((build(prisma) as any).maxSerialForPrefix('UF-FEST')).resolves.toBe(41);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('Indian-script fonts (B19)', () => {
  it('maps each script to its Noto face and returns null for Latin', () => {
    expect(SCRIPT_FONTS.find((f) => f.range.test('ప్రియ'))?.family).toBe('Noto Sans Telugu');
    expect(SCRIPT_FONTS.find((f) => f.range.test('प्रिया'))?.family).toBe('Noto Sans Devanagari');
    expect(scriptFontFor('Priya', false)).toBeNull();
  });
});
