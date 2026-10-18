import { assertEventSchedule } from './event-dates';

describe('assertEventSchedule (B17)', () => {
  const now = new Date('2026-10-18T00:00:00Z');
  const at = (iso: string) => new Date(iso);
  const ok = (s: string, e: string, tz = 'Asia/Kolkata') => () => assertEventSchedule(at(s), at(e), tz, { now });

  it('accepts a normal event', () => {
    expect(ok('2026-11-01T10:00:00Z', '2026-11-01T18:00:00Z')).not.toThrow();
  });

  it('rejects bad dates, backwards or empty runs, typo years and unknown zones', () => {
    expect(ok('nope', '2026-11-01T18:00:00Z')).toThrow(/valid dates/);
    expect(ok('2026-11-01T18:00:00Z', '2026-11-01T10:00:00Z')).toThrow(/end after/);
    expect(ok('2026-11-01T10:00:00Z', '2026-11-01T10:00:00Z')).toThrow(/end after/);
    expect(ok('2026-11-01T10:00:00Z', '2028-11-01T10:00:00Z')).toThrow(/year at most/);
    expect(ok('2062-11-01T10:00:00Z', '2062-11-02T10:00:00Z')).toThrow(/3 years/);
    expect(ok('2026-11-01T10:00:00Z', '2026-11-01T18:00:00Z', 'India/Delhi')).toThrow(/timezone/);
  });

  it('lets an edit skip the lead check', () => {
    expect(() =>
      assertEventSchedule(at('2062-11-01T10:00:00Z'), at('2062-11-02T10:00:00Z'), 'UTC', { now, checkLead: false }),
    ).not.toThrow();
  });
});
