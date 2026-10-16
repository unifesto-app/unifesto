import { resolveEffectiveSponsor } from './sponsors.util';

const row = (overrideDescription: string | null) =>
  ({
    id: 'es1',
    sponsorId: 's1',
    overrideLogoUrl: overrideDescription,
    overrideDescription,
    leadCaptureEnabled: false,
    order: 0,
    tier: null,
    sponsor: { name: 'Acme', logoUrl: 'roster.png', description: 'Roster', websiteUrl: null },
  }) as any;

describe('resolveEffectiveSponsor overrides', () => {
  it.each([null, '', '   '])('inherits the roster value for %p', (v) => {
    const s = resolveEffectiveSponsor(row(v));
    expect(s.description).toBe('Roster');
    expect(s.logoUrl).toBe('roster.png');
  });

  it('uses a real override', () => {
    const s = resolveEffectiveSponsor(row('Event copy'));
    expect(s.description).toBe('Event copy');
    expect(s.logoUrl).toBe('Event copy');
  });
});
