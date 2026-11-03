import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { WegobeyondService } from './wegobeyond.service';
import { DOC_NAMES, validateDoc, type DocName } from './wegobeyond.schema';

/** The documents the migration seeds, read back out of its SQL. */
const SEED = Object.fromEntries(
  [
    ...readFileSync(
      join(
        __dirname,
        '../../prisma/migrations/20261204100000_wegobeyond_content/migration.sql',
      ),
      'utf8',
    ).matchAll(/\('(\w+)', \$json\$([\s\S]*?)\$json\$::jsonb\)/g),
  ].map(([, name, json]) => [name, JSON.parse(json)]),
) as Record<DocName, any>;

function build() {
  const docs = new Map<string, any>(
    DOC_NAMES.map((name) => [
      name,
      { name, data: SEED[name], version: 1, updatedAt: new Date() },
    ]),
  );
  const signups: any[] = [];
  const prisma: any = {
    wegobeyondDoc: {
      findMany: async () => [...docs.values()],
      findUnique: async ({ where }: any) => docs.get(where.name) ?? null,
      updateMany: async ({ where, data }: any) => {
        const row = docs.get(where.name);
        if (!row || row.version !== where.version) return { count: 0 };
        Object.assign(row, {
          data: data.data,
          version: row.version + data.version.increment,
        });
        return { count: 1 };
      },
    },
    wegobeyondCrewSignup: {
      create: async ({ data }: any) => signups.push(data),
    },
  };
  const storage: any = {
    uploadFile: jest.fn(async () => 'https://bucket/wegobeyond/gallery/x.png'),
  };
  return { service: new WegobeyondService(prisma, storage), signups, storage };
}

describe('WeGoBeyond schema', () => {
  it('seeds all six documents, each already valid and normalised', () => {
    expect(Object.keys(SEED).sort()).toEqual([...DOC_NAMES].sort());
    for (const name of DOC_NAMES) {
      const r = validateDoc(name, SEED[name]);
      expect(r).toEqual({ ok: true, value: SEED[name] });
    }
  });

  it('refuses bad input with a message naming the field', () => {
    const badEmail = validateDoc('press', {
      ...SEED.press,
      pressEmail: 'not-an-email',
    });
    expect(
      !badEmail.ok &&
        badEmail.errors.some((e) => e.includes('Press contact email')),
    ).toBe(true);

    const [a, b] = SEED.initiatives.initiatives;
    const dup = validateDoc('initiatives', {
      initiatives: [a, { ...b, slug: a.slug }],
    });
    expect(!dup.ok && dup.errors.some((e) => e.includes('used twice'))).toBe(
      true,
    );

    expect(
      validateDoc('initiatives', {
        initiatives: [{ ...a, slug: 'Not A Slug' }],
      }).ok,
    ).toBe(false);

    const http = validateDoc('settings', {
      ...SEED.settings,
      socials: [
        {
          brand: 'unifesto',
          network: 'x',
          label: 'X',
          href: 'http://insecure.example',
        },
      ],
    });
    expect(!http.ok && http.errors.some((e) => e.includes('https://'))).toBe(
      true,
    );

    expect(validateDoc('press', { ...SEED.press, releases: 'nope' }).ok).toBe(
      false,
    );
    expect(
      validateDoc('team', { members: [{ name: 'A', role: 'Boss' }] }).ok,
    ).toBe(false);
  });

  it('trims, lowercases match phrases, drops blank lines and unknown keys', () => {
    const [a] = SEED.initiatives.initiatives;
    const r = validateDoc('initiatives', {
      initiatives: [
        {
          ...a,
          name: '  Spaced  ',
          match: ['  Build With AIA ', ''],
          extra: 'drop me',
        },
      ],
      stray: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).not.toHaveProperty('stray');
    const first = (r.value.initiatives as Record<string, unknown>[])[0];
    expect(first.name).toBe('Spaced');
    expect(first.match).toEqual(['build with aia']);
    expect(first).not.toHaveProperty('extra');
  });

  it('takes an uploaded photo or an https link, nothing else', () => {
    const photo = (src: string) =>
      validateDoc('gallery', { photos: [{ src, alt: 'A room', caption: '' }] })
        .ok;
    expect(
      photo('https://bucket.s3.amazonaws.com/wegobeyond/gallery/a-1.jpg'),
    ).toBe(true);
    expect(photo('/gallery/build-with-aia.webp')).toBe(true);
    expect(photo('javascript:alert(1)')).toBe(false);
    expect(photo('/gallery/../secret.png')).toBe(false);
  });
});

describe('WegobeyondService', () => {
  it('saves against the current version and refuses a stale one', async () => {
    const { service } = build();
    const next = { ...SEED.settings, heroLead: '  New hero line ' };
    const saved = await service.save('settings', next, 1, 'u1');
    expect(saved.version).toBe(2);
    expect((saved.data as any).heroLead).toBe('New hero line');

    // A second editor still holding version 1.
    await expect(
      service.save('settings', SEED.settings, 1, 'u2'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an invalid save before touching the row', async () => {
    const { service } = build();
    await expect(
      service.save('press', { ...SEED.press, pressEmail: 'x' }, 1, 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((await service.adminDoc('press')).version).toBe(1);
  });

  it('serves all documents publicly, and only known names', async () => {
    const { service } = build();
    expect(Object.keys(await service.publicContent())).toEqual([...DOC_NAMES]);
    await expect(service.publicDoc('secrets')).rejects.toThrow(
      'No such WeGoBeyond document',
    );
  });

  it('stores only JPG, PNG or WebP photos, judged by their bytes', async () => {
    const { service, storage } = build();
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const ico = Buffer.from('00000100010010100000010020006804', 'hex');
    await expect(
      service.uploadPhoto({ buffer: png, mimetype: 'image/gif' } as any),
    ).resolves.toEqual({
      url: 'https://bucket/wegobeyond/gallery/x.png',
    });
    expect(storage.uploadFile).toHaveBeenCalledWith(
      expect.anything(),
      'wegobeyond/gallery/',
      expect.any(String),
    );
    await expect(
      service.uploadPhoto({ buffer: ico, mimetype: 'image/png' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadPhoto(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('crew sign-ups', () => {
    const form = {
      name: ' Asha ',
      email: 'asha@example.com',
      phone: '+91 98765 43210',
      city: 'Hyderabad',
      role: 'Student',
      interests: ['Design', 'Not an option'],
      availability: ['Weekends'],
      consent: true,
    };

    it('stores a sign-up, keeping only options from the crew form', async () => {
      const { service, signups } = build();
      await expect(service.signUp(form)).resolves.toEqual({ ok: true });
      expect(signups).toHaveLength(1);
      expect(signups[0]).toMatchObject({
        name: 'Asha',
        interests: ['Design'],
        availability: ['Weekends'],
      });
    });

    it('answers field errors as a 422 map', async () => {
      const { service, signups } = build();
      const err = await service
        .signUp({
          ...form,
          email: 'nope',
          interests: ['Not an option'],
          role: 'Wizard',
          consent: 'yes',
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(Object.keys(err.getResponse().message).sort()).toEqual([
        'consent',
        'email',
        'interests',
        'role',
      ]);
      expect(signups).toHaveLength(0);
    });

    it('accepts and drops a honeypot submission', async () => {
      const { service, signups } = build();
      await expect(
        service.signUp({ ...form, company_website: 'spam.example' }),
      ).resolves.toEqual({ ok: true });
      expect(signups).toHaveLength(0);
    });
  });
});
