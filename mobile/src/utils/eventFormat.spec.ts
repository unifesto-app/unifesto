// Runs with mobile's jest: `npm test` (jest.config.js).
import { crowdLabel, groupByDay, rowTime } from './eventFormat';
import { composeHome, rollUpToSuperEvents } from '../hooks/useHomeData';
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

describe('composeHome', () => {
  const e = (id: string, day: number) => ev(id, at(day, 18)) as unknown as Event;
  const ids = (list: { id: string }[]) => list.map((x) => x.id);
  const base = {
    tickets: [{ id: 'ticket' }, { id: 'talk', parentEventId: 'fest' }],
    invitedEventIds: ['invite'],
    favorites: [e('saved', 20), e('mixer', 14), e('ticket', 12)],
    feed: [e('fest', 15), e('ticket', 12), e('mixer', 14), e('open', 13), e('run', 15), e('saved', 20)],
    now: now.getTime(),
  };

  it('shows every event once, in page order', () => {
    const home = composeHome({ ...base, spaceEvents: [e('invite', 11), e('mixer', 14), e('over', 9)], featuredEvents: [e('wgb', 16)] });
    expect(home.spotlight?.id).toBe('wgb'); // the featured space leads the cover
    expect(ids(home.fromMySpaces)).toEqual(['mixer']); // the invite leads the page; ended events drop
    expect(home.featured).toEqual([]); // my spaces have something on
    expect(ids(home.shortlist)).toEqual(['saved']); // ticket and mixer are already shown
    expect(ids(home.nearYou)).toEqual(['open', 'run']); // nor the fest I hold a sub-event ticket for
  });

  it('falls back to the featured space when nothing is on in my spaces', () => {
    const home = composeHome({ ...base, spaceEvents: [], featuredEvents: [e('wgb2', 18), e('wgb', 16), e('invite', 11)] });
    expect(home.spotlight?.id).toBe('wgb'); // soonest, and the invite is already mine
    expect(ids(home.featured)).toEqual(['wgb2']);
    expect(ids(home.shortlist)).toEqual(['mixer', 'saved']);
    expect(ids(home.nearYou)).toEqual(['open', 'run']);
  });

  it('leaves the featured list empty when its only event is the spotlight', () => {
    const home = composeHome({ ...base, spaceEvents: [], featuredEvents: [e('wgb', 16)] });
    expect(home.spotlight?.id).toBe('wgb');
    expect(home.featured).toEqual([]); // Home shows the Explore spaces row instead
  });

  it('takes the spotlight from my spaces, then near you, never from what is already mine', () => {
    const mine = composeHome({ ...base, spaceEvents: [e('mixer', 14), e('club', 13)], featuredEvents: [] });
    expect(mine.spotlight?.id).toBe('club');
    expect(ids(mine.fromMySpaces)).toEqual(['mixer']);

    const near = composeHome({ ...base, spaceEvents: [], featuredEvents: [] });
    expect(near.spotlight?.id).toBe('open'); // fest and ticket are mine; open is the soonest left
    expect(near.nearYou.map((x) => x.id)).not.toContain('open');
    expect(mine.spotlightFromSpaces).toBe(true); // final once the space lists load
    expect(near.spotlightFromSpaces).toBe(false); // waits for the feed
  });

  it('never repeats a check-in I am running, and keeps undated events in the lists', () => {
    const tba = { id: 'tba', startDateTime: '' } as unknown as Event;
    const home = composeHome({
      ...base,
      checkinEventIds: ['door'],
      spaceEvents: [e('door', 10), e('mixer', 14)],
      featuredEvents: [],
      favorites: [tba],
    });
    expect(home.spotlight?.id).toBe('mixer'); // not the event at the door
    expect(ids(home.fromMySpaces)).toEqual([]);
    expect(ids(home.shortlist)).toEqual(['tba']); // a saved TBA event stays, it just can't be the cover
  });
});

describe('rollUpToSuperEvents', () => {
  it('keeps a sub-event when the parent is only a breadcrumb with no dates', () => {
    const sub = { id: 's', title: 'Talk', startDateTime: at(14, 10), parentEvent: { id: 'p', title: 'Fest', slug: 'fest' } };
    expect(rollUpToSuperEvents([sub as unknown as Event]).map((e) => e.id)).toEqual(['s']);
  });
});
