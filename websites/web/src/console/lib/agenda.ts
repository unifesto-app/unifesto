/**
 * Agenda slots in the console's content editor: a day, a start and an end, each
 * time typed with an explicit am or pm (the browser's own date-time box let a
 * "1:00" save as 1 am). Browser time, like the console's other date fields.
 */

type Slot = { startTime: string; endTime: string; location?: string };

/** The editor's form values for a slot: day "YYYY-MM-DD", start and end "1:30 pm". */
export type SlotForm = { day: string; start: string; end: string };

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

/** Earliest first; parallel slots by end, then by room, as the event page lists them. */
export const byStart = (a: Slot, b: Slot) =>
  Date.parse(a.startTime) - Date.parse(b.startTime) ||
  Date.parse(a.endTime) - Date.parse(b.endTime) ||
  (a.location ?? "").localeCompare(b.location ?? "");

/** A saved slot as form values. */
export const slotForm = (slot: Slot): SlotForm => {
  const s = new Date(slot.startTime);
  return { day: dayOf(s), start: clockOf(s), end: clockOf(new Date(slot.endTime)) };
};

/**
 * A new slot starts when the latest-starting one ends (the first, when the
 * event starts) and runs 30 minutes, so its day and am/pm are already right.
 */
export function nextSlotForm(slots: Slot[], eventStartIso: string): SlotForm {
  const last = [...slots].sort(byStart).at(-1);
  const start = new Date(last ? last.endTime : eventStartIso);
  return slotForm({
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 30 * 60_000).toISOString(),
  });
}

/**
 * The form's slot as ISO times, or why it can't be saved. An end at or before
 * the start is the next morning (an overnight hackathon slot), and every slot
 * sits inside the event's hours, which is what catches a wrong am/pm.
 */
export function readSlot(
  v: SlotForm,
  event: { startDateTime: string; endDateTime: string }
): { startTime: string; endTime: string } | { error: string } {
  const startMin = clockMinutes(v.start);
  const endMin = clockMinutes(v.end);
  if (startMin === null || endMin === null) return { error: "Enter times like 10:30 and pick am or pm." };
  const [y, m, d] = v.day.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, startMin);
  const end = new Date(y, m - 1, d + (endMin <= startMin ? 1 : 0), 0, endMin);
  if (start < new Date(event.startDateTime) || end > new Date(event.endDateTime)) {
    return {
      error: `This slot runs ${slotLabel(start.toISOString(), end.toISOString())}, outside the event's hours (${slotLabel(event.startDateTime, event.endDateTime)}). Check am and pm, or change the event's times first.`,
    };
  }
  return { startTime: start.toISOString(), endTime: end.toISOString() };
}
