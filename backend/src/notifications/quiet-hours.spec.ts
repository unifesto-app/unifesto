import { quietHoursDeferral } from './quiet-hours';

// IST = UTC+5:30. ist('23:15') is that wall-clock time in IST on 1 Nov 2026.
const ist = (hhmm: string, day = 1) => new Date(`2026-11-0${day}T${hhmm}:00+05:30`);
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

describe('quietHoursDeferral (IST)', () => {
  it('is off when unset or empty', () => {
    expect(quietHoursDeferral(ist('23:00'), null, min('07:00'))).toBeNull();
    expect(quietHoursDeferral(ist('23:00'), min('22:00'), undefined)).toBeNull();
    expect(quietHoursDeferral(ist('23:00'), min('22:00'), min('22:00'))).toBeNull();
  });

  it('same-day window: defers to the end inside, sends now outside', () => {
    const [s, e] = [min('13:00'), min('15:30')];
    expect(quietHoursDeferral(ist('14:10'), s, e)).toEqual(ist('15:30'));
    expect(quietHoursDeferral(ist('13:00'), s, e)).toEqual(ist('15:30')); // start is inside
    expect(quietHoursDeferral(ist('15:30'), s, e)).toBeNull(); // end is outside
    expect(quietHoursDeferral(ist('12:59'), s, e)).toBeNull();
  });

  it('window crossing midnight: before midnight defers to the next morning', () => {
    const [s, e] = [min('22:00'), min('07:00')];
    expect(quietHoursDeferral(ist('23:15', 1), s, e)).toEqual(ist('07:00', 2));
    expect(quietHoursDeferral(ist('02:30', 2), s, e)).toEqual(ist('07:00', 2));
    expect(quietHoursDeferral(ist('07:00', 2), s, e)).toBeNull();
    expect(quietHoursDeferral(ist('21:59', 1), s, e)).toBeNull();
  });

  it('uses IST, not the server clock: 17:00 UTC is 22:30 IST', () => {
    expect(quietHoursDeferral(new Date('2026-11-01T17:00:00Z'), min('22:00'), min('07:00'))).toEqual(
      new Date('2026-11-02T01:30:00Z'), // 07:00 IST
    );
  });

  it('a window starting at midnight IST (18:30 UTC the day before)', () => {
    expect(quietHoursDeferral(new Date('2026-11-01T18:45:00Z'), 0, min('06:00'))).toEqual(ist('06:00', 2));
  });
});
