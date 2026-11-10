// Runs with mobile's jest: `npm test` (jest.config.js).
import { groupByDay, weekendLabel } from './eventFormat';

// Tue 10 Nov 2026, 10:00 local.
const now = new Date(2026, 10, 10, 10, 0);
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString();
const ev = (id: string, start: string, end?: string) => ({ id, startDateTime: start, endDateTime: end });

describe('groupByDay', () => {
  it('drops ended events, sorts by start and labels each day', () => {
    const groups = groupByDay(
      [
        ev('sat', at(14, 18)),
        ev('over', at(9, 9), at(9, 12)),
        ev('fest', at(9, 9), at(12, 18)),
        ev('tonight', at(10, 19)),
        ev('wed', at(11, 8)),
        ev('thu', at(12, 19)),
      ],
      8,
      now,
    );
    expect(groups.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ['Happening now', ['fest']],
      ['Today', ['tonight']],
      ['Tomorrow', ['wed']],
      ['Thu 12 Nov', ['thu']],
      ['Sat 14 Nov', ['sat']],
    ]);
  });

  it('keeps one group per day and stops at max', () => {
    const groups = groupByDay([ev('a', at(14, 9)), ev('b', at(14, 18)), ev('c', at(15, 10))], 2, now);
    expect(groups).toEqual([{ label: 'Sat 14 Nov', events: [ev('a', at(14, 9)), ev('b', at(14, 18))] }]);
  });
});

describe('weekendLabel', () => {
  it('names the coming weekend, and the current one on a Sunday', () => {
    expect(weekendLabel(now)).toBe('Sat 14 to Sun 15 Nov');
    expect(weekendLabel(new Date(2026, 10, 15, 12))).toBe('Sat 14 to Sun 15 Nov');
    expect(weekendLabel(new Date(2026, 9, 28))).toBe('Sat 31 Oct to Sun 1 Nov');
  });
});
