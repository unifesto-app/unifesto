import { BrandSpace, resolveEventBranding, resolveSpaceBranding } from './branding.util';

const space = (over: Partial<BrandSpace> = {}): BrandSpace => ({
  name: 'Acme',
  logoUrl: 'https://cdn/logo.png',
  whiteLabelEnabled: true,
  brandingSuspendedAt: null,
  brandColor: '#ff0000',
  brandLogoUrl: null,
  brandFont: 'dm-sans',
  brandMode: 'light',
  hidePoweredBy: true,
  faviconUrl: null,
  emailFromName: null,
  emailReplyTo: null,
  ...over,
});
const plainEvent = { whiteLabelEnabled: false, brandColor: null };

describe('branding.util', () => {
  it('renders the full space theme when on + plan + not suspended', () => {
    expect(resolveSpaceBranding(space(), true)).toEqual({
      name: 'Acme',
      color: '#ff0000',
      logoUrl: 'https://cdn/logo.png', // falls back to the square logo
      logoSquare: true,
      font: 'DM Sans',
      mode: 'light',
      hidePoweredBy: true,
      faviconUrl: null,
      customDomain: null,
    });
  });

  it('exposes the verified custom web domain', () => {
    const b = resolveSpaceBranding(space({ domains: [{ hostname: 'events.acme.edu' }] }), true);
    expect(b?.customDomain).toBe('events.acme.edu');
  });

  it('is off without the plan, when switched off, or when suspended', () => {
    expect(resolveSpaceBranding(space(), false)).toBeNull();
    expect(resolveSpaceBranding(space({ whiteLabelEnabled: false }), true)).toBeNull();
    expect(resolveSpaceBranding(space({ brandingSuspendedAt: new Date() }), true)).toBeNull();
  });

  it('drops unknown font/mode keys instead of rendering them', () => {
    const b = resolveSpaceBranding(space({ brandFont: 'comic', brandMode: 'neon' }), true);
    expect(b?.font).toBeNull();
    expect(b?.mode).toBeNull();
  });

  it('event inherits the space theme and may override only the colour', () => {
    expect(resolveEventBranding(plainEvent, space(), true)?.color).toBe('#ff0000');
    const o = resolveEventBranding({ whiteLabelEnabled: true, brandColor: '#00ff00' }, space(), true);
    expect(o?.color).toBe('#00ff00');
    expect(o?.font).toBe('DM Sans');
  });

  it('event override works with the space theme off, but not when suspended', () => {
    const ev = { whiteLabelEnabled: true, brandColor: '#00ff00' };
    const only = resolveEventBranding(ev, space({ whiteLabelEnabled: false }), true);
    expect(only?.color).toBe('#00ff00');
    expect(only?.name).toBeNull(); // no space theme → clients keep Unifesto chrome
    expect(resolveEventBranding(ev, space({ brandingSuspendedAt: new Date() }), true)).toBeNull();
    expect(resolveEventBranding(ev, space(), false)).toBeNull();
  });
});
