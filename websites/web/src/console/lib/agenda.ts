/**
 * Agenda slots in the console's content editor: a day, a start and an end, each
 * time typed with an explicit am or pm (the browser's own date-time box let a
 * "1:00" save as 1 am). Browser time, like the console's other date fields.
 */

type Slot = { startTime: string; endTime: string; location?: string };

/** The editor's form values for a slot: start and end days "YYYY-MM-DD", times "1:30 pm". */
export type SlotForm = { day: string; start: string; endDay: string; end: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD", browser time. */
export const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "1:05 pm", the editor's time value. */
export const clockOf = (d: Date) => `${d.getHours() % 12 || 12}:${pad(d.getMinutes())} ${d.getHours() < 12 ? "am" : "pm"}`;

/**
 * Minutes after midnight for "1 pm", "1:30 pm" or "1.30 am". An hour of 0 or
 * past 12 ("13:30") is already 24-hour, whatever the am/pm says; null when it
 * isn't a time.
 */
export function clockMinutes(value: string): number | null {
  const m = value.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  if (h === 0 || h > 12 || !m[3]) return h * 60 + min;
  return ((h % 12) + (m[3] === "pm" ? 12 : 0)) * 60 + min;
}

/** Each day the event runs, as "YYYY-MM-DD". */
export function eventDays(startIso: string, endIso: string): string[] {
  const days: string[] = [];
  const end = new Date(endIso);
  // ponytail: capped at 31 days; a longer event picks a later day by editing its dates.
  for (const d = new Date(startIso); d <= end && days.length < 31; d.setDate(d.getDate() + 1)) {
    days.push(dayOf(d));
  }
  const last = dayOf(end);
  if (days.length < 31 && days.at(-1) !== last) days.push(last);
  return days;
}

const DAY = { weekday: "short", day: "numeric", month: "short" } as const;
const CLOCK = { hour: "numeric", minute: "2-digit" } as const;

/** "Sat, 28 Nov" for a Date or a "YYYY-MM-DD" day. */
export function dayLabel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(`${d}T00:00`) : d;
  return date.toLocaleDateString("en-IN", DAY);
}

/** "Sat, 28 Nov · 10:00 am – 5:00 pm"; an overnight slot names both days. */
export function slotLabel(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const clock = (d: Date) => d.toLocaleTimeString("en-IN", CLOCK);
  return dayOf(s) === dayOf(e)
    ? `${dayLabel(s)} · ${clock(s)} – ${clock(e)}`
    : `${dayLabel(s)}, ${clock(s)} – ${dayLabel(e)}, ${clock(e)}`;
}

/** Earliest first; parallel slots by end, then by room with no room last, as the API sorts them. */
export const byStart = (a: Slot, b: Slot) =>
  Date.parse(a.startTime) - Date.parse(b.startTime) ||
  Date.parse(a.endTime) - Date.parse(b.endTime) ||
  Number(!a.location) - Number(!b.location) ||
  (a.location ?? "").localeCompare(b.location ?? "");

/** A saved slot as form values. */
export const slotForm = (slot: Slot): SlotForm => {
  const s = new Date(slot.startTime);
  const e = new Date(slot.endTime);
  return { day: dayOf(s), start: clockOf(s), endDay: dayOf(e), end: clockOf(e) };
};

type EventHours = { startDateTime: string; endDateTime: string };
const HALF_HOUR = 30 * 60_000;

/**
 * A new slot starts when the latest-starting one ends (the first, when the
 * event starts) and runs 30 minutes, so its day and am/pm are already right.
 * It stays inside the event's hours, so the prefill always saves.
 */
export function nextSlotForm(slots: Slot[], event: EventHours): SlotForm {
  const last = [...slots].sort(byStart).at(-1);
  const eventEnd = Date.parse(event.endDateTime);
  const from = Date.parse(last ? last.endTime : event.startDateTime);
  const start = Math.max(Date.parse(event.startDateTime), Math.min(from, eventEnd - HALF_HOUR));
  return slotForm({
    startTime: new Date(start).toISOString(),
    endTime: new Date(Math.min(start + HALF_HOUR, eventEnd)).toISOString(),
  });
}

const at = (day: string, minutes: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, minutes);
};

/**
 * The form's slot as ISO times, or why it can't be saved. The end day is
 * picked, never guessed (an overnight or 36-hour hackathon slot ends on a
 * later day), and every slot sits inside the event's hours, which is what
 * catches a wrong am/pm.
 */
export function readSlot(v: SlotForm, event: EventHours): { startTime: string; endTime: string } | { error: string } {
  const startMin = clockMinutes(v.start);
  const endMin = clockMinutes(v.end);
  if (startMin === null || endMin === null) return { error: "Enter times like 10:30 and pick am or pm." };
  const start = at(v.day, startMin);
  const end = at(v.endDay || v.day, endMin);
  if (end <= start) {
    return {
      error: "The slot has to end after it starts. Check am and pm, or for an overnight slot pick the day it ends on.",
    };
  }
  if (start < new Date(event.startDateTime) || end > new Date(event.endDateTime)) {
    return {
      error: `This slot runs ${slotLabel(start.toISOString(), end.toISOString())}, outside the event's hours (${slotLabel(event.startDateTime, event.endDateTime)}). Check am and pm, or change the event's times first.`,
    };
  }
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}
