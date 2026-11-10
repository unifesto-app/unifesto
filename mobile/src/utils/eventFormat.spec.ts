// Runs with mobile's jest: `npm test` (jest.config.js).
import { crowdLabel, groupByDay, rowTime } from './eventFormat';
import { rollUpToSuperEvents } from '../hooks/useHomeData';
import type { Event } from '../lib/api/events';

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

describe('groupByDay priority and bad rows', () => {
  it('keeps the first events by priority before sorting, so later city events beat sooner picks', () => {
    const city = ev('city', at(14, 18));
    const groups = groupByDay([city, ev('pick1', at(10, 19)), ev('pick2', at(11, 8))], 1, now);
    expect(groups).toEqual([{ label: 'Sat 14 Nov', events: [city] }]);
  });

  it('drops events the organiser ended early and rows with no usable date', () => {
    const groups = groupByDay(
      [{ ...ev('done', at(10, 9), at(10, 20)), status: 'COMPLETED' }, ev('nodate', ''), ev('ok', at(11, 9))],
      8,
      now,
    );
    expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([['ok']]);
  });
});

describe('rowTime', () => {
  it('says the start time, or when something already on ends', () => {
    expect(rowTime(ev('a', at(10, 19)), now)).toMatch(/^7:00 PM$/i);
    expect(rowTime(ev('b', at(10, 9), at(10, 21)), now)).toMatch(/^Until 9:00 PM$/i);
    expect(rowTime(ev('c', at(9, 9), at(12, 18)), now)).toBe('Until Thu 12 Nov');
  });
});

describe('crowdLabel', () => {
  it('stays quiet for a small crowd, counts a real one and warns when a capped event fills', () => {
    expect(crowdLabel({ registeredCount: 3, capacity: null })).toBeNull();
    expect(crowdLabel({ registeredCount: undefined })).toBeNull();
    expect(crowdLabel({ registeredCount: 64, capacity: null })).toEqual({ text: '64 going', hot: false });
    expect(crowdLabel({ registeredCount: 64, capacity: 200 })).toEqual({ text: '64 going', hot: false });
    expect(crowdLabel({ registeredCount: 9, capacity: 10 })).toEqual({ text: 'Almost full', hot: true });
    expect(crowdLabel({ registeredCount: 200, capacity: 200 })).toEqual({ text: 'Full', hot: true });
  });
});

describe('rollUpToSuperEvents', () => {
  it('keeps a sub-event when the parent is only a breadcrumb with no dates', () => {
    const sub = { id: 's', title: 'Talk', startDateTime: at(14, 10), parentEvent: { id: 'p', title: 'Fest', slug: 'fest' } };
    expect(rollUpToSuperEvents([sub as unknown as Event]).map((e) => e.id)).toEqual(['s']);
  });
});
