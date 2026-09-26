/**
 * A focused, dependency-free RFC-5545 RRULE subset for the event-calendar
 * recurrence engine (P2). Pure functions only — no Prisma, no I/O — so the
 * series expansion logic stays trivially unit-testable.
 *
 * Supported: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, and
 * BYDAY (weekday list, used by WEEKLY). This covers the authoring UI's options;
 * anything outside it is rejected at parse time rather than silently mishandled.
 *
 * Timezone note: occurrences preserve DTSTART's wall-clock via UTC-component
 * arithmetic. For fixed-offset zones (Asia/Kolkata — the platform default, no
 * DST) this is exact. A DST zone could drift by an hour across a transition;
 * that's an accepted v1 limitation, documented here rather than hidden.
 */

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ParsedRRule {
  freq: Frequency;
  interval: number; // >= 1
  count?: number; // total occurrences incl. the first; mutually exclusive with until
  until?: Date; // inclusive upper bound; mutually exclusive with count
  byDay?: number[]; // weekday numbers 0=SU..6=SA, ascending, WEEKLY only
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const FREQS: Frequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** Parse an "UNTIL" value: either a basic UTC stamp (YYYYMMDD[THHMMSSZ]) or ISO. */
function parseUntil(raw: string): Date {
  const basic = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(raw);
  if (basic) {
    const [, y, mo, d, h = '23', mi = '59', s = '59'] = basic;
    return new Date(
      Date.UTC(+y, +mo - 1, +d, +h, +mi, +s),
    );
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid UNTIL value: "${raw}"`);
  }
  return parsed;
}

/**
 * Parse an RRULE string (with or without a leading "RRULE:") into a validated
 * ParsedRRule. Throws on anything malformed or outside the supported subset, so
 * callers can surface a clean 400 instead of generating garbage.
 */
export function parseRRule(input: string): ParsedRRule {
  const body = input.trim().replace(/^RRULE:/i, '');
  if (!body) throw new Error('Empty RRULE');

  const parts = new Map<string, string>();
  for (const seg of body.split(';')) {
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq === -1) throw new Error(`Malformed RRULE part: "${seg}"`);
    parts.set(seg.slice(0, eq).toUpperCase(), seg.slice(eq + 1));
  }

  const freq = parts.get('FREQ')?.toUpperCase() as Frequency | undefined;
  if (!freq || !FREQS.includes(freq)) {
    throw new Error(`Unsupported or missing FREQ (got "${parts.get('FREQ')}")`);
  }

  const interval = parts.has('INTERVAL') ? Number(parts.get('INTERVAL')) : 1;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error(`INTERVAL must be a positive integer (got "${parts.get('INTERVAL')}")`);
  }

  if (parts.has('COUNT') && parts.has('UNTIL')) {
    throw new Error('RRULE may not set both COUNT and UNTIL');
  }

  let count: number | undefined;
  if (parts.has('COUNT')) {
    count = Number(parts.get('COUNT'));
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`COUNT must be a positive integer (got "${parts.get('COUNT')}")`);
    }
  }

  const until = parts.has('UNTIL') ? parseUntil(parts.get('UNTIL')!) : undefined;

  let byDay: number[] | undefined;
  if (parts.has('BYDAY')) {
    byDay = parts
      .get('BYDAY')!
      .split(',')
      .map((code) => {
        const idx = WEEKDAY_CODES.indexOf(code.toUpperCase() as never);
        if (idx === -1) throw new Error(`Invalid BYDAY code: "${code}"`);
        return idx;
      })
      .sort((a, b) => a - b);
    if (freq !== 'WEEKLY') {
      // We only honour BYDAY for WEEKLY in v1; reject it elsewhere rather than
      // ignore it, so an unsupported rule never silently loses meaning.
      throw new Error('BYDAY is only supported with FREQ=WEEKLY in v1');
    }
  }

  return { freq, interval, count, until, byDay };
}

/** Serialize back to a canonical RRULE string (used for storage + ICS emit). */
export function serializeRRule(r: ParsedRRule): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval && r.interval !== 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byDay?.length) {
    parts.push(`BYDAY=${r.byDay.map((d) => WEEKDAY_CODES[d]).join(',')}`);
  }
  if (r.count != null) parts.push(`COUNT=${r.count}`);
  if (r.until) {
    const u = r.until;
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    parts.push(
      `UNTIL=${p(u.getUTCFullYear(), 4)}${p(u.getUTCMonth() + 1)}${p(u.getUTCDate())}T${p(u.getUTCHours())}${p(u.getUTCMinutes())}${p(u.getUTCSeconds())}Z`,
    );
  }
  return parts.join(';');
}

/** Build a Date from another's UTC time-of-day but a given Y/M/D. */
function withDate(template: Date, year: number, month: number, day: number): Date {
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      template.getUTCHours(),
      template.getUTCMinutes(),
      template.getUTCSeconds(),
    ),
  );
}

function addDaysUTC(d: Date, days: number): Date {
  return withDate(d, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days);
}

/** Whole-day difference between two instants (UTC midnight aligned). */
function dayDiff(a: Date, b: Date): number {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcA - utcB) / 86_400_000);
}

export interface ExpandOptions {
  /** Only return occurrences at/after this instant (filter, not a start point). */
  from?: Date;
  /** Do not generate past this instant (rolling-window far edge). Required. */
  to: Date;
  /** Hard safety cap on generated occurrences, regardless of bounds. */
  max?: number;
}

/**
 * Expand a series into concrete occurrence start instants.
 *
 * Generation always begins at `dtstart` (so COUNT and UNTIL are honoured from
 * the true first occurrence); `from` filters the output window afterwards. The
 * scan is bounded by `to`, by COUNT/UNTIL, and by `max` (default 750).
 */
export function expandRRule(
  dtstart: Date,
  rule: string | ParsedRRule,
  opts: ExpandOptions,
): Date[] {
  const r = typeof rule === 'string' ? parseRRule(rule) : rule;
  const max = opts.max ?? 750;
  const to = opts.to;
  const from = opts.from;
  const out: Date[] = [];

  // `produced` counts every occurrence generated from dtstart (for COUNT),
  // even those before `from`, because COUNT is defined over the whole series.
  let produced = 0;
  const emit = (occ: Date): 'stop' | 'skip' | 'ok' => {
    if (r.until && occ.getTime() > r.until.getTime()) return 'stop';
    if (occ.getTime() > to.getTime()) return 'stop';
    produced += 1;
    if (r.count != null && produced > r.count) return 'stop';
    if (from && occ.getTime() < from.getTime()) return 'skip';
    out.push(occ);
    return 'ok';
  };

  let guard = 0;
  const tripped = () => (guard += 1) > max * 4 + 1000;

  if (r.freq === 'DAILY') {
    let occ = dtstart;
    while (out.length < max) {
      const res = emit(occ);
      if (res === 'stop') break;
      occ = addDaysUTC(occ, r.interval);
      if (tripped()) break;
    }
  } else if (r.freq === 'WEEKLY') {
    const byDay = r.byDay?.length ? r.byDay : [dtstart.getUTCDay()];
    // Anchor the week grid on the Monday (WKST=MO) of dtstart's week.
    const startDow = dtstart.getUTCDay(); // 0=SU..6=SA
    const daysSinceMonday = (startDow + 6) % 7;
    const weekAnchor = addDaysUTC(dtstart, -daysSinceMonday);
    let day = dtstart;
    while (out.length < max) {
      const weekIndex = Math.floor(dayDiff(day, weekAnchor) / 7);
      const inIntervalWeek = weekIndex % r.interval === 0;
      if (inIntervalWeek && byDay.includes(day.getUTCDay()) && day.getTime() >= dtstart.getTime()) {
        const res = emit(day);
        if (res === 'stop') break;
      }
      day = addDaysUTC(day, 1);
      if (day.getTime() > to.getTime() && !(r.count != null)) break;
      if (tripped()) break;
    }
  } else if (r.freq === 'MONTHLY') {
    const dom = dtstart.getUTCDate();
    let step = 0;
    while (out.length < max) {
      const targetMonthIndex = dtstart.getUTCMonth() + step * r.interval;
      const y = dtstart.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
      const m = ((targetMonthIndex % 12) + 12) % 12;
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      if (dom <= daysInMonth) {
        const occ = withDate(dtstart, y, m, dom);
        const res = emit(occ);
        if (res === 'stop') break;
      }
      // Months lacking the target day (e.g. day 31 in Feb) are skipped, not
      // clamped — matching the RFC's behaviour for BYMONTHDAY-less MONTHLY.
      step += 1;
      if (tripped()) break;
    }
  } else {
    // YEARLY
    const dom = dtstart.getUTCDate();
    const mo = dtstart.getUTCMonth();
    let step = 0;
    while (out.length < max) {
      const y = dtstart.getUTCFullYear() + step * r.interval;
      const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      if (dom <= daysInMonth) {
        const occ = withDate(dtstart, y, mo, dom);
        const res = emit(occ);
        if (res === 'stop') break;
      }
      step += 1;
      if (tripped()) break;
    }
  }

  return out;
}
