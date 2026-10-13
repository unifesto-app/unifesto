import { CareersService, RESUME_PRIVATE_PREFIX } from './careers.service';

// S25: résumés must never be uploaded to a public URL.
describe('CareersService résumés', () => {
  const build = () => {
    const prisma = {
      career: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
        findUnique: jest.fn().mockResolvedValue({ id: 'c1', title: 'Eng' }),
        count: jest.fn().mockResolvedValue(1),
      },
      careerApplication: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
      },
    };
    const storage = {
      uploadFile: jest.fn().mockResolvedValue('https://public/x.pdf'),
      uploadPrivate: jest.fn().mockResolvedValue(undefined),
      signedGetUrl: jest.fn().mockResolvedValue('https://signed'),
    };
    return {
      svc: new CareersService(prisma as never, storage as never),
      prisma,
      storage,
    };
  };

  it('stores the résumé privately, never via the public uploader', async () => {
    const { svc, prisma, storage } = build();
    await svc.apply('c1', { fullName: 'A', email: 'a@x.com' } as never, {
      mimetype: 'application/pdf',
      size: 100,
      buffer: Buffer.from('%PDF'),
      originalname: 'cv.pdf',
    } as never);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    const key = storage.uploadPrivate.mock.calls[0][1] as string;
    expect(key.startsWith(RESUME_PRIVATE_PREFIX)).toBe(true);
    expect(key.endsWith('.pdf')).toBe(true);
    expect(prisma.careerApplication.create.mock.calls[0][0].data.resumeUrl).toBe(
      key,
    );
  });

  it('hands admins a signed link for private résumés, legacy URLs as-is', async () => {
    const { svc, prisma } = build();
    prisma.careerApplication.findMany.mockResolvedValue([
      { id: 'a1', resumeUrl: `${RESUME_PRIVATE_PREFIX}k.pdf` },
      { id: 'a2', resumeUrl: 'https://old/public.pdf' },
    ]);
    const res = await svc.listApplications('c1');
    expect(res.applications.map((a) => a.resumeUrl)).toEqual([
      'https://signed',
      'https://old/public.pdf',
    ]);
  });
});
