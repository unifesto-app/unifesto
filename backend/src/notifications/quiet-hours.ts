/** IST is UTC+5:30 all year (no DST). */
const IST_OFFSET_MIN = 330;
const DAY_MIN = 24 * 60;

/**
 * When a push sent at `now` should go out for someone with quiet hours
 * `start`-`end` (minutes after midnight IST): the window's end if `now` falls
 * inside it, else null (send now). Off when either bound is null or they're
 * equal. A window crossing midnight (22:00-07:00) is start > end.
 */
export function quietHoursDeferral(
  now: Date,
  start: number | null | undefined,
  end: number | null | undefined,
): Date | null {
  if (start == null || end == null || start === end) return null;
  const nowMin = Math.floor(now.getTime() / 60_000);
  const minOfDay = (((nowMin + IST_OFFSET_MIN) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const inside = start < end ? minOfDay >= start && minOfDay < end : minOfDay >= start || minOfDay < end;
  if (!inside) return null;
  const wait = (end - minOfDay + DAY_MIN) % DAY_MIN;
  return new Date((nowMin + wait) * 60_000);
}

/** Midnight IST that began `now`'s day (the daily cap's day, C16). */
export function istDayStart(now: Date): Date {
  const offset = IST_OFFSET_MIN * 60_000;
  const day = DAY_MIN * 60_000;
  return new Date(Math.floor((now.getTime() + offset) / day) * day - offset);
}

/** Quiet hours are either off (both null) or a real window (both set, different). */
export function validQuietHours(start: number | null | undefined, end: number | null | undefined): boolean {
  return start == null ? end == null : end != null && start !== end;
}
