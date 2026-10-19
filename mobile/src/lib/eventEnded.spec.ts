// Mobile has no jest of its own; run with the backend's (from backend/):
// npx jest --maxWorkers=1 --config '{"roots":["../mobile/src/lib"],"testRegex":"\\.spec\\.ts$","transform":{"^.+\\.ts$":["ts-jest",{"tsconfig":{"module":"commonjs"}}]}}'
import { isEventOver } from './eventEnded';

const now = Date.parse('2026-10-19T12:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe('isEventOver', () => {
  it('is over once the end time has passed', () => {
    expect(isEventOver({ startDateTime: hoursAgo(100), endDateTime: hoursAgo(96) }, now)).toBe(true);
    expect(isEventOver({ startDateTime: hoursAgo(2), endDateTime: hoursAgo(-2) }, now)).toBe(false);
  });

  it('is over when the organiser completes or cancels it early', () => {
    const live = { startDateTime: hoursAgo(1), endDateTime: hoursAgo(-5) };
    expect(isEventOver({ ...live, status: 'COMPLETED' }, now)).toBe(true);
    expect(isEventOver({ ...live, eventStatus: 'CANCELLED' }, now)).toBe(true);
    expect(isEventOver({ ...live, status: 'PUBLISHED' }, now)).toBe(false);
  });

  it('gives an event with no end time three hours', () => {
    expect(isEventOver({ startDateTime: hoursAgo(2) }, now)).toBe(false);
    expect(isEventOver({ startDateTime: hoursAgo(4) }, now)).toBe(true);
    expect(isEventOver({ startDateTime: hoursAgo(4), endDateTime: 'not a date' }, now)).toBe(true);
  });

  it('never calls an undated event over', () => {
    expect(isEventOver({}, now)).toBe(false);
    expect(isEventOver(null, now)).toBe(false);
  });
});
