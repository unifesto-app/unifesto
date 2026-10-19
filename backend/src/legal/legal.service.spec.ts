import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LegalService } from './legal.service';

/** In-memory stand-in for the two legal tables (plus the operator check). */
function build(operators: string[] = []) {
  const docs: any[] = [];
  const acc: any[] = [];
  const pick = (row: any, select?: any) => {
    if (!select) return row;
    const out: any = {};
    for (const k of Object.keys(select)) {
      if (k === 'document') out.document = { slug: docs.find((d) => d.id === row.documentId).slug };
      else if (k === '_count') out._count = { acceptances: acc.filter((a) => a.documentId === row.id).length };
      else out[k] = row[k];
    }
    return out;
  };
  const match = (d: any, where: any = {}) =>
    Object.entries(where).every(([k, v]: [string, any]) =>
      v === null ? d[k] == null : v && typeof v === 'object' && 'not' in v ? d[k] != null : d[k] === v,
    );
  const byVersionDesc = (a: any, b: any) => b.version - a.version;
  const prisma: any = {
    legalDocument: {
      findFirst: async ({ where, select }: any) => {
        const d = docs.filter((x) => match(x, where)).sort(byVersionDesc)[0];
        return d ? pick(d, select) : null;
      },
      findMany: async ({ where, select }: any) => docs.filter((x) => match(x, where)).sort(byVersionDesc).map((d) => pick(d, select)),
      findUnique: async ({ where, select }: any) => {
        const d = where.id
          ? docs.find((x) => x.id === where.id)
          : docs.find((x) => x.slug === where.slug_version.slug && x.version === where.slug_version.version);
        return d ? pick(d, select) : null;
      },
      create: async ({ data }: any) => {
        const d = { id: `d${docs.length + 1}`, publishedAt: null, ...data };
        docs.push(d);
        return d;
      },
      update: async ({ where, data }: any) => Object.assign(docs.find((d) => d.id === where.id), data),
      updateMany: async ({ where, data }: any) => {
        const hit = docs.filter((d) => match(d, where));
        hit.forEach((d) => Object.assign(d, data));
        return { count: hit.length };
      },
    },
    legalAcceptance: {
      findMany: async ({ where, select }: any) => acc.filter((a) => a.userId === where.userId).map((a) => pick(a, select)),
      upsert: async ({ where, create }: any) => {
        const k = where.userId_documentId;
        if (!acc.some((a) => a.userId === k.userId && a.documentId === k.documentId)) acc.push(create);
      },
    },
    userRole: { count: async ({ where }: any) => (operators.includes(where.userId) ? 1 : 0) },
  };
  return { svc: new LegalService(prisma), docs, acc };
}

async function publishNew(svc: LegalService, slug: string, requiresAcceptance: boolean, body = 'text') {
  const d = await svc.saveDraft(slug, { title: slug, body, summary: 'What changed', requiresAcceptance });
  await svc.publish(d.id);
  return d;
}

describe('LegalService (I2)', () => {
  it('public endpoint returns the latest published version, never a draft', async () => {
    const { svc } = build();
    await publishNew(svc, 'terms', false, 'v1');
    await publishNew(svc, 'terms', false, 'v2');
    await svc.saveDraft('terms', { title: 'Terms', body: 'v3 draft' });

    const doc = await svc.getPublished('terms');
    expect(doc.version).toBe(2);
    expect(doc.body).toBe('v2');
    await expect(svc.getPublished('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a draft-only document is not public', async () => {
    const { svc } = build();
    await svc.saveDraft('sponsor-terms', { title: 'Sponsor terms', body: 'draft' });
    await expect(svc.getPublished('sponsor-terms')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('saving twice edits the one open draft instead of adding versions', async () => {
    const { svc, docs } = build();
    await publishNew(svc, 'privacy', false);
    await svc.saveDraft('privacy', { title: 'Privacy', body: 'a' });
    const d = await svc.saveDraft('privacy', { title: 'Privacy', body: 'b' });
    expect(docs).toHaveLength(2);
    expect(d.version).toBe(2);
    expect(d.body).toBe('b');
  });

  it('a published version cannot be published again', async () => {
    const { svc } = build();
    const d = await publishNew(svc, 'terms', false);
    await expect(svc.publish(d.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a new version that requires acceptance is pending for every user, and accepting clears it', async () => {
    const { svc } = build();
    await publishNew(svc, 'terms', false);
    expect(await svc.pending('u1')).toEqual([]);

    await publishNew(svc, 'terms', true);
    for (const u of ['u1', 'u2']) {
      const p = await svc.pending(u);
      expect(p.map((d) => [d.slug, d.version])).toEqual([['terms', 2]]);
      expect(p[0].summary).toBe('What changed');
    }

    await svc.accept('u1', 'terms', 2, 'mobile');
    expect(await svc.pending('u1')).toEqual([]);
    expect(await svc.pending('u2')).toHaveLength(1);
  });

  it('a later minor version keeps the earlier required one pending, and shows the latest text', async () => {
    const { svc } = build();
    await publishNew(svc, 'privacy', true);
    await publishNew(svc, 'privacy', false);
    expect((await svc.pending('u1')).map((d) => d.version)).toEqual([2]);
    await svc.accept('u1', 'privacy', 2, 'web');
    expect(await svc.pending('u1')).toEqual([]);
  });

  it('accepting is idempotent and refuses drafts', async () => {
    const { svc, acc } = build();
    await publishNew(svc, 'terms', true);
    await svc.accept('u1', 'terms', 1, 'space');
    await svc.accept('u1', 'terms', 1, 'space');
    expect(acc).toHaveLength(1);
    await svc.saveDraft('terms', { title: 'Terms', body: 'next' });
    await expect(svc.accept('u1', 'terms', 2, 'space')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the organiser agreement is only asked of Space operators', async () => {
    const { svc } = build(['op']);
    await publishNew(svc, 'organiser-agreement', true);
    await publishNew(svc, 'terms', true);
    expect((await svc.pending('op')).map((d) => d.slug).sort()).toEqual(['organiser-agreement', 'terms']);
    expect((await svc.pending('attendee')).map((d) => d.slug)).toEqual(['terms']);
  });
});
