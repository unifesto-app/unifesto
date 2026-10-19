// Mobile has no jest of its own; run with the backend's (from backend/):
// npx jest --maxWorkers=1 --config '{"roots":["../mobile/src/lib"],"testRegex":"whatsNew\\.spec\\.ts$","transform":{"^.+\\.ts$":["ts-jest",{"tsconfig":{"module":"commonjs"}}]}}'
import { WHATS_NEW, shouldShowWhatsNew } from './whatsNew';

describe('shouldShowWhatsNew', () => {
  it('never shows on a fresh install', () => {
    expect(shouldShowWhatsNew('5.0.0', null, false)).toBe(false);
  });

  it('shows once after an update', () => {
    expect(shouldShowWhatsNew('5.0.0', '4.1.0', true)).toBe(true);
    expect(shouldShowWhatsNew('5.0.0', '4.1.0', false)).toBe(true);
    // The caller then marks 5.0.0 seen, so the next launch is quiet.
    expect(shouldShowWhatsNew('5.0.0', '5.0.0', true)).toBe(false);
  });

  it('shows to an upgrade from a build before notes existed', () => {
    expect(shouldShowWhatsNew('5.0.0', null, true)).toBe(true);
  });

  it('shows again for the next release with notes', () => {
    expect(shouldShowWhatsNew('5.1.0', '5.0.0', true)).toBe(true);
  });
});

describe('WHATS_NEW', () => {
  it('keeps the newest release first, with 4 to 6 items a section and house voice', () => {
    expect(WHATS_NEW[0].version).toBe('5.0.0');
    for (const section of WHATS_NEW[0].sections) {
      expect(section.items.length).toBeGreaterThanOrEqual(4);
      expect(section.items.length).toBeLessThanOrEqual(6);
      for (const item of section.items) {
        const text = `${item.title} ${item.body ?? ''}`;
        expect(text).not.toMatch(/[—–]/);
        expect(text).not.toMatch(/\b[A-Z]{4,}\b/);
      }
    }
  });
});
