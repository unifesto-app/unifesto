import { EventStatus } from '@prisma/client';
import { editWindow } from './attendee-details.service';

describe('editWindow', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const base = {
    status: EventStatus.PUBLISHED,
    endDateTime: new Date('2026-10-05T10:00:00Z'),
    attendeeEditsEnabled: true,
    attendeeEditsUntil: null as Date | null,
  };

  it('is open while enabled with no deadline', () => {
    expect(editWindow(base, now)).toEqual({ open: true, reason: null });
  });

  it('is closed until the curator turns it on', () => {
    expect(editWindow({ ...base, attendeeEditsEnabled: false }, now).open).toBe(false);
  });

  it('closes at the deadline', () => {
    expect(editWindow({ ...base, attendeeEditsUntil: new Date('2026-10-01T11:00:00Z') }, now).open).toBe(true);
    expect(editWindow({ ...base, attendeeEditsUntil: new Date('2026-10-01T10:00:00Z') }, now).open).toBe(false);
  });

  it('is closed once the event has ended or was cancelled, whatever the switch says', () => {
    expect(editWindow({ ...base, status: EventStatus.COMPLETED }, now).reason).toBe('This event has ended.');
    expect(editWindow({ ...base, endDateTime: new Date('2026-09-30T10:00:00Z') }, now).open).toBe(false);
    expect(editWindow({ ...base, status: EventStatus.CANCELLED }, now).reason).toBe('This event was cancelled.');
  });
});
