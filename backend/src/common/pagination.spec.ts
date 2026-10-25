import { toLimit, toPage } from './pagination';

describe('toPage / toLimit', () => {
  it('falls back on garbage instead of passing NaN to Prisma', () => {
    for (const bad of ['abc', '', '0', '-3', undefined, null]) {
      expect(toPage(bad)).toBe(1);
      expect(toLimit(bad, 10)).toBe(10);
    }
  });

  it('keeps valid values and truncates decimals', () => {
    expect(toPage('3')).toBe(3);
    expect(toPage(2.9)).toBe(2);
    expect(toLimit('25')).toBe(25);
  });

  it('caps the limit', () => {
    expect(toLimit('100000')).toBe(500);
    expect(toLimit('100000', 10, 50)).toBe(50);
  });
});
