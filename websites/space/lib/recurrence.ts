/**
 * UI-state <-> RRULE-string conversion for the recurrence editor (event-calendar
 * P2). Mirrors the backend's supported RFC-5545 subset exactly (FREQ
 * DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT|UNTIL, weekly BYDAY) so what the
 * editor lets you build is always what the backend accepts.
 */

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type RecurrenceEnd = "never" | "count" | "until";

export interface RecurrenceState {
  /** false = a one-time event (no RRULE emitted). */
  enabled: boolean;
  freq: RecurrenceFreq;
  interval: number;
  /** Weekday numbers 0=SU..6=SA — used only when freq === "WEEKLY". */
  weekdays: number[];
  end: RecurrenceEnd;
  /** Number of occurrences when end === "count". */
  count: number;
  /** yyyy-mm-dd (a <input type="date"> value) when end === "until". */
  until: string;
}

export const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function defaultRecurrence(startWeekday = 1): RecurrenceState {
  return {
    enabled: false,
    freq: "WEEKLY",
    interval: 1,
    weekdays: [startWeekday],
    end: "count",
    count: 8,
    until: "",
  };
}

/** yyyy-mm-dd -> compact basic date "YYYYMMDD" the backend's UNTIL parser accepts. */
function untilToBasic(ymd: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * Build an RRULE string from the editor state, or null when the event is not
 * recurring (or the state is incomplete). Returning null keeps the caller simple:
 * a null just means "send no recurrenceRule".
 */
export function buildRRule(s: RecurrenceState): string | null {
  if (!s.enabled) return null;

  const parts = [`FREQ=${s.freq}`];
  const interval = Math.max(1, Math.floor(s.interval || 1));
  if (interval !== 1) parts.push(`INTERVAL=${interval}`);

  if (s.freq === "WEEKLY" && s.weekdays.length) {
    const days = [...s.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_CODES[d])
      .join(",");
    parts.push(`BYDAY=${days}`);
  }

  if (s.end === "count") {
    const c = Math.max(1, Math.floor(s.count || 1));
    parts.push(`COUNT=${c}`);
  } else if (s.end === "until") {
    const basic = untilToBasic(s.until);
    if (!basic) return null; // an "until" series with no date isn't valid yet
    parts.push(`UNTIL=${basic}`);
  }
  // end === "never" emits neither COUNT nor UNTIL (the engine caps it to the
  // rolling window).

  return parts.join(";");
}

/**
 * Parse an existing RRULE back into editor state (for the edit page). Unknown or
 * empty rules fall back to a sensible default with `enabled` reflecting presence.
 */
export function parseRRuleToState(
  rule: string | null | undefined,
  fallbackWeekday = 1
): RecurrenceState {
  const base = defaultRecurrence(fallbackWeekday);
  if (!rule) return base;

  const map = new Map<string, string>();
  for (const seg of rule.replace(/^RRULE:/i, "").split(";")) {
    const i = seg.indexOf("=");
    if (i > 0) map.set(seg.slice(0, i).toUpperCase(), seg.slice(i + 1));
  }

  const freq = map.get("FREQ")?.toUpperCase();
  const s: RecurrenceState = { ...base, enabled: true };
  if (freq === "DAILY" || freq === "WEEKLY" || freq === "MONTHLY" || freq === "YEARLY") {
    s.freq = freq;
  }
  if (map.has("INTERVAL")) s.interval = Math.max(1, Number(map.get("INTERVAL")) || 1);
  if (map.has("BYDAY")) {
    s.weekdays = map
      .get("BYDAY")!
      .split(",")
      .map((c) => WEEKDAY_CODES.indexOf(c.toUpperCase() as never))
      .filter((n) => n >= 0);
  }
  if (map.has("COUNT")) {
    s.end = "count";
    s.count = Math.max(1, Number(map.get("COUNT")) || 1);
  } else if (map.has("UNTIL")) {
    s.end = "until";
    const u = map.get("UNTIL")!;
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(u);
    if (m) s.until = `${m[1]}-${m[2]}-${m[3]}`;
  } else {
    s.end = "never";
  }
  return s;
}

/** Human summary of a recurrence, e.g. "Every 2 weeks on Mon, Wed · 8 times". */
export function describeRecurrence(s: RecurrenceState): string {
  if (!s.enabled) return "Does not repeat";
  const n = Math.max(1, Math.floor(s.interval || 1));
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[s.freq];
  let base = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  if (s.freq === "WEEKLY" && s.weekdays.length) {
    const days = [...s.weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(", ");
    base += ` on ${days}`;
  }
  if (s.end === "count") base += ` · ${s.count} time${s.count === 1 ? "" : "s"}`;
  else if (s.end === "until" && s.until) base += ` · until ${s.until}`;
  else base += " · ongoing";
  return base;
}
