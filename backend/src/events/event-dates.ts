import { BadRequestException } from '@nestjs/common';

const DAY = 86_400_000;

/**
 * Q26: an event that runs late keeps check-in open this long past its end time.
 * The hourly job completes it after that; the organiser's End event does it at once.
 * ponytail: one grace for every event; make it a per-event setting if organisers ask.
 */
export const END_GRACE_MS = 3 * 60 * 60 * 1000;
/** Longer than a year is almost always a typo'd year. */
const MAX_LENGTH_DAYS = 366;
/** Starting more than 3 years out is almost always a typo'd year too. */
const MAX_LEAD_DAYS = 3 * 365;

/** True for an IANA zone the runtime knows ("Asia/Kolkata"). */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reject an event schedule that can't be right (B17): unparseable dates, an
 * end at or before the start, a run of over a year, a start years away, or an
 * unknown timezone (which would also crash every date we format for it).
 * `checkLead` is off for edits of existing events that are already far out.
 */
export function assertEventSchedule(
  start: Date,
  end: Date,
  timezone: string,
  { now = new Date(), checkLead = true }: { now?: Date; checkLead?: boolean } = {},
): void {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new BadRequestException('Give the start and end as valid dates.');
  }
  if (end.getTime() <= start.getTime()) {
    throw new BadRequestException('The event has to end after it starts.');
  }
  if (end.getTime() - start.getTime() > MAX_LENGTH_DAYS * DAY) {
    throw new BadRequestException('An event can run for a year at most. Check the end date.');
  }
  if (checkLead && start.getTime() - now.getTime() > MAX_LEAD_DAYS * DAY) {
    throw new BadRequestException('The start is more than 3 years away. Check the year.');
  }
  if (!isValidTimezone(timezone)) {
    throw new BadRequestException(`"${timezone}" isn't a timezone we know. Use one like Asia/Kolkata.`);
  }
}

/** "7 June 2026" */
export function formatEventDate(dateTime: Date, timezone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(dateTime);
}

/** "10:00 AM - 1:00 PM IST" */
export function formatEventTime(startTime: Date, endTime: Date, timezone = 'Asia/Kolkata'): string {
  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(date);
  return `${formatTime(startTime)} - ${formatTime(endTime)} IST`;
}
