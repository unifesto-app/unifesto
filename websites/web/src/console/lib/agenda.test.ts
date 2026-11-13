import { test } from "node:test";
import assert from "node:assert/strict";
import { byStart, clockMinutes, eventDays, nextSlotForm, readSlot, slotForm } from "@/console/lib/agenda";

// Local times, so the checks hold in any timezone.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const summit = { startDateTime: at(28, 10), endDateTime: at(28, 17) }; // 28 Nov, 10 am – 5 pm
const hackathon = { startDateTime: at(28, 10), endDateTime: at(29, 22) }; // 28 Nov 10 am – 29 Nov 10 pm
const day28 = (start: string, end: string) => ({ day: "2026-11-28", start, endDay: "2026-11-28", end });

test("times read with their am or pm; 24-hour hours win", () => {
  assert.equal(clockMinutes("1:00 pm"), 13 * 60);
  assert.equal(clockMinutes("1 am"), 60);
  assert.equal(clockMinutes("12:30 pm"), 12 * 60 + 30);
  assert.equal(clockMinutes("12:00 am"), 0);
  assert.equal(clockMinutes("4.15 PM"), 16 * 60 + 15);
  assert.equal(clockMinutes("13:30 am"), 13 * 60 + 30);
  assert.equal(clockMinutes("25:00 pm"), null);
  assert.equal(clockMinutes(" pm"), null);
});

test("the summit's lunch typed as 1:00 am is held, with the event's hours", () => {
  const lunch = readSlot(day28("1:00 am", "2:00 am"), summit);
  assert.ok("error" in lunch && /outside the event's hours/.test(lunch.error));
  assert.deepEqual(readSlot(day28("1:00 pm", "2:00 pm"), summit), { startTime: at(28, 13), endTime: at(28, 14) });
});

test("an end at or before the start is held, never stretched to the next day", () => {
  for (const end of ["5:00 am", "10:00 am"]) {
    const slot = readSlot(day28("10:00 am", end), hackathon);
    assert.ok("error" in slot && /end after it starts/.test(slot.error));
  }
  assert.deepEqual(readSlot(day28("10:00 am", "5:00 pm"), summit), { startTime: at(28, 10), endTime: at(28, 17) });
});

test("overnight and 36-hour hackathon slots end on the day picked, and edit back unchanged", () => {
  const overnight = { day: "2026-11-28", start: "10:00 pm", endDay: "2026-11-29", end: "6:00 am" };
  assert.deepEqual(readSlot(overnight, hackathon), { startTime: at(28, 22), endTime: at(29, 6) });
  const hacking = { startTime: at(28, 10), endTime: at(29, 22) };
  assert.deepEqual(readSlot(slotForm(hacking), hackathon), hacking);
});

test("a multi-day event offers each of its days", () => {
  assert.deepEqual(eventDays(hackathon.startDateTime, hackathon.endDateTime), ["2026-11-28", "2026-11-29"]);
  assert.deepEqual(eventDays(summit.startDateTime, summit.endDateTime), ["2026-11-28"]);
  assert.deepEqual(eventDays(at(28, 22), at(29, 2)), ["2026-11-28", "2026-11-29"]);
});

test("parallel and all-day slots sort by start, then end, then room with no room last", () => {
  const slots = [
    { startTime: at(28, 13), endTime: at(28, 14) },
    { startTime: at(28, 13), endTime: at(28, 14), location: "Hall B" },
    { startTime: at(28, 13), endTime: at(28, 14), location: "Hall A" },
    { startTime: at(28, 10), endTime: at(28, 17) },
    { startTime: at(28, 10), endTime: at(28, 10, 30) },
  ];
  assert.deepEqual(
    [...slots].sort(byStart).map((s) => [new Date(s.startTime).getHours(), new Date(s.endTime).getHours(), s.location]),
    [[10, 10, undefined], [10, 17, undefined], [13, 14, "Hall A"], [13, 14, "Hall B"], [13, 14, undefined]]
  );
});

test("a new slot starts where the latest one ends, am/pm included, inside the event's hours", () => {
  assert.deepEqual(nextSlotForm([], summit), { day: "2026-11-28", start: "10:00 am", endDay: "2026-11-28", end: "10:30 am" });
  const morning = [
    { startTime: at(28, 10), endTime: at(28, 17) }, // registration, all day
    { startTime: at(28, 12, 30), endTime: at(28, 13) },
  ];
  assert.deepEqual(nextSlotForm(morning, summit), { day: "2026-11-28", start: "1:00 pm", endDay: "2026-11-28", end: "1:30 pm" });
  const closing = [{ startTime: at(28, 16, 30), endTime: at(28, 17) }];
  const last = nextSlotForm(closing, summit);
  assert.deepEqual(last, { day: "2026-11-28", start: "4:30 pm", endDay: "2026-11-28", end: "5:00 pm" });
  assert.ok(!("error" in readSlot(last, summit)));
  assert.deepEqual(slotForm({ startTime: at(28, 0, 5), endTime: at(28, 12) }), { day: "2026-11-28", start: "12:05 am", endDay: "2026-11-28", end: "12:00 pm" });
});
