import {
  PUSH_BODY_MAX,
  PUSH_TITLE_MAX,
  commsDraftRequest,
  commsDraftSource,
  groundCommsDraft,
  parseCommsDraft,
  type CommsDraftInput,
} from './campaign-draft';
import { CampaignsService } from './campaigns.service';

const input = (over: Partial<CommsDraftInput> = {}): CommsDraftInput => ({
  line: 'hack night moved to hall b, same time',
  from: 'Robotics Club',
  push: true,
  email: true,
  whatsapp: null,
  event: {
    title: 'Hack Night',
    when: 'Fri, 14 Nov 2026, 6:00 PM - 11:00 PM IST',
    venue: 'Hall B, Hyderabad',
    tickets: 'General free',
    link: 'https://unifesto.app/event/hack-night',
  },
  today: 'Sat, 8 Nov 2026',
  ...over,
});

describe('comms draft (C17 Write with AI)', () => {
  it('sends the line as data, with the event facts and only the asked channels', () => {
    const req = commsDraftRequest(input({ email: false }));
    const content = req.messages[0].content as string;
    expect(content).toContain('<line>\nhack night moved to hall b, same time\n</line>');
    expect(content).toContain('<channels>push</channels>');
    expect(content).toContain('link: https://unifesto.app/event/hack-night');
    expect(req.outputConfig).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
  });

  it('keeps only asked channels, cuts push to what a phone shows, and escapes the email', () => {
    const draft = parseCommsDraft(
      {
        push: { title: 'x'.repeat(200), body: 'y'.repeat(400) },
        email: { subject: 'Hall B tonight', paragraphs: ['Hi {{firstName}},', 'We moved to <Hall B>.', ''] },
        whatsappParams: ['{name}'],
      },
      input(),
    );
    expect(draft?.push?.title).toHaveLength(PUSH_TITLE_MAX);
    expect(draft?.push?.body).toHaveLength(PUSH_BODY_MAX);
    expect(draft?.email).toEqual({ subject: 'Hall B tonight', html: '<p>Hi {{firstName}},</p><p>We moved to &lt;Hall B&gt;.</p>' });
    expect(draft?.whatsappParams).toBeUndefined(); // not asked for
  });

  it('WhatsApp values must match the template exactly; an empty reply drafts nothing', () => {
    const wa = input({ push: false, email: false, whatsapp: { bodyText: 'Hi {{1}}, {{2}} moved.', paramCount: 2 } });
    expect(parseCommsDraft({ push: { title: '', body: '' }, email: { subject: '', paragraphs: [] }, whatsappParams: ['{name}'] }, wa)).toBeNull();
    expect(parseCommsDraft({ whatsappParams: ['{name}', 'Hack Night'] }, wa)?.whatsappParams).toEqual(['{name}', 'Hack Night']);
    expect(parseCommsDraft({ push: { title: '', body: '' }, email: { subject: '', paragraphs: [] }, whatsappParams: [] }, input())).toBeNull();
  });

  it('AI10: a channel that invents a price or a link is left out, and says why', () => {
    const source = commsDraftSource(input());
    const { draft, dropped } = groundCommsDraft(
      {
        push: { title: 'Hack Night is in Hall B', body: 'Same time, 6 PM. Tickets ₹499 at the door.' },
        email: { subject: 'Hall B', html: '<p>Details at https://unifesto.app/event/hack-night</p>' },
        whatsappParams: ['{name}', 'bit.ly/hn'],
      },
      source,
    );
    expect(draft.push).toBeUndefined();
    expect(draft.email).toBeDefined();
    expect(draft.whatsappParams).toBeDefined(); // a bare "bit.ly/hn" has no scheme or www: the prompt, not AI10, keeps it out
    expect(dropped).toEqual(['Push: amount "₹499" isn\'t in your line or the event']);
  });
});

describe('CampaignsService.draft', () => {
  const event = {
    title: 'Hack Night',
    slug: 'hack-night',
    type: 'IN_PERSON',
    timezone: 'Asia/Kolkata',
    startDateTime: new Date('2026-11-14T12:30:00Z'),
    endDateTime: new Date('2026-11-14T17:30:00Z'),
    venueName: 'Hall B',
    city: 'Hyderabad',
    ticketTypes: [{ name: 'General', price: 0 }],
  };
  const build = (reply: unknown, ok = true) => {
    const prisma: any = {
      event: { findFirst: jest.fn(async ({ where }: any) => (where.id === 'e1' && (!where.spaceId || where.spaceId === 's1') ? event : null)) },
      space: { findUnique: jest.fn().mockResolvedValue({ name: 'Robotics Club' }) },
    };
    const ai: any = { run: jest.fn().mockResolvedValue(ok ? { ok: true, json: reply } : { ok: false, reason: 'capped' }) };
    const svc = new CampaignsService(prisma, {} as any, {} as any, {} as any, {} as any, undefined, undefined, ai);
    return { svc, ai };
  };
  const SPACE = { scope: 'SPACE' as const, spaceId: 's1' };

  it("drafts from the space's own event, billed to the space", async () => {
    const { svc, ai } = build({ push: { title: 'Hack Night is in Hall B', body: 'Same time. See you there.' }, email: { subject: '', paragraphs: [] }, whatsappParams: [] });
    const res = await svc.draft(SPACE, 'org', { line: 'moved to hall b', channels: ['push'], eventId: 'e1' });
    expect(res).toEqual({ ok: true, draft: { push: { title: 'Hack Night is in Hall B', body: 'Same time. See you there.' } } });
    const run = ai.run.mock.calls[0];
    expect(run[0]).toBe('comms_draft');
    expect(run[1]).toMatchObject({ userId: 'org', spaceId: 's1', billable: true });
    expect(run[1].messages[0].content).toContain('<from>Robotics Club</from>');
    expect(run[1].messages[0].content).toContain('tickets: General free');
  });

  it("refuses another space's event and WhatsApp for organisers", async () => {
    const { svc } = build({});
    await expect(svc.draft(SPACE, 'org', { line: 'hello all', channels: ['push'], eventId: 'e9' })).rejects.toThrow('not in this space');
    await expect(svc.draft(SPACE, 'org', { line: 'hello all', channels: ['whatsapp'] })).rejects.toThrow('WhatsApp');
  });

  it('holds a draft whose every channel invents something, and passes AI refusals on', async () => {
    const held = build({ push: { title: 'Early bird ends', body: 'Only ₹199 till Sunday.' }, email: { subject: '', paragraphs: [] }, whatsappParams: [] });
    expect(await held.svc.draft(SPACE, 'org', { line: 'early bird is ending', channels: ['push'] })).toEqual({
      ok: false,
      reason: 'held',
      why: 'Push: amount "₹199" isn\'t in your line or the event',
    });
    const capped = build(null, false);
    expect(await capped.svc.draft({ scope: 'PLATFORM' }, 'admin', { line: 'new feature', channels: ['push'] })).toEqual({ ok: false, reason: 'capped' });
  });
});
