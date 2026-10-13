import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FormUploadsService, sniffMime } from './form-uploads.service';
import { formUploadPrefix } from './form-answers.util';

const PDF = Buffer.from('%PDF-1.7\n...');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const EXE = Buffer.from('MZ\x90\x00');

const file = (buffer: Buffer, originalname = 'cv.pdf') =>
  ({ buffer, size: buffer.length, originalname }) as Express.Multer.File;

function setup(
  opts: { status?: string; manager?: boolean; config?: unknown } = {},
) {
  const stored: string[] = [];
  const deletedPrefixes: string[] = [];
  const updates: string[] = [];
  const prisma: any = {
    eventFormField: {
      findUnique: async () => ({
        id: 'f1',
        eventId: 'ev1',
        type: 'FILE',
        config: opts.config ?? null,
        event: {
          id: 'ev1',
          status: opts.status ?? 'PUBLISHED',
          endDateTime: new Date(Date.now() + 86400000),
          deletedAt: null,
        },
      }),
    },
    event: {
      findUnique: async () => ({ formUploadsPurgedAt: null }),
      findMany: async () => [{ id: 'old1' }],
      update: async ({ where }: any) => updates.push(where.id),
    },
  };
  const storage: any = {
    uploadPrivate: async (_b: Buffer, key: string) => stored.push(key),
    signedGetUrl: async (key: string) => `signed:${key}`,
    deletePrefix: async (p: string) => (deletedPrefixes.push(p), 3),
  };
  const authz: any = { can: async () => !!opts.manager };
  return {
    svc: new FormUploadsService(prisma, storage, authz, {} as any),
    stored,
    deletedPrefixes,
    updates,
  };
}

describe('sniffMime', () => {
  it('reads the real type, not the name', () => {
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(EXE)).toBeNull();
  });
});

describe('FormUploadsService', () => {
  it('stores an allowed file privately under the uploader prefix', async () => {
    const { svc, stored } = setup();
    const a = await svc.upload('u1', 'ev1', 'f1', file(PDF));
    expect(a.key.startsWith(formUploadPrefix('ev1', 'f1', 'u1'))).toBe(true);
    expect(a.key.endsWith('.pdf')).toBe(true);
    expect(stored).toEqual([a.key]);
  });

  it('rejects a disallowed or disguised type', async () => {
    const { svc } = setup({ config: { fileKinds: ['image'] } });
    await expect(
      svc.upload('u1', 'ev1', 'f1', file(PDF)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.upload('u1', 'ev1', 'f1', file(EXE, 'photo.png')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces the size limit', async () => {
    const { svc } = setup({ config: { maxSizeMb: 1 } });
    const big = { ...file(PDF), size: 2 * 1024 * 1024 };
    await expect(svc.upload('u1', 'ev1', 'f1', big)).rejects.toThrow(/1 MB/);
  });

  it('only lets managers upload once registration is closed', async () => {
    await expect(
      setup({ status: 'COMPLETED' }).svc.upload('u1', 'ev1', 'f1', file(PDF)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup({ status: 'COMPLETED', manager: true }).svc.upload(
        'u1',
        'ev1',
        'f1',
        file(PDF),
      ),
    ).resolves.toBeTruthy();
  });

  it('gives view links to the uploader or a manager only', async () => {
    const key = `${formUploadPrefix('ev1', 'f1', 'u1')}x.pdf`;
    await expect(setup().svc.viewUrl('u1', 'ev1', key)).resolves.toEqual({
      url: `signed:${key}`,
    });
    await expect(setup().svc.viewUrl('u2', 'ev1', key)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      setup({ manager: true }).svc.viewUrl('u2', 'ev1', key),
    ).resolves.toBeTruthy();
    await expect(setup().svc.viewUrl('u1', 'ev2', key)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('purges old events and stamps them', async () => {
    const { svc, deletedPrefixes, updates } = setup();
    expect(await svc.purgeExpired()).toBe(3);
    expect(deletedPrefixes).toEqual(['private/form-uploads/old1/']);
    expect(updates).toEqual(['old1']);
  });
});
