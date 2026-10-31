import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEvent } from "@/lib/api/events";

const priced = (prices: string[], extra: Record<string, unknown> = {}) =>
  mapEvent({ id: "e", title: "E", slug: "e", ticketTypes: prices.map((price, i) => ({ id: `t${i}`, price, currency: "INR" })), ...extra })!;

test("event 'Starting from' is the cheapest paid ticket, never the free one", () => {
  const e = priced(["0", "499", "199"]);
  assert.equal(e.price, 199);
  assert.equal(e.is_free, false);
});

test("an event is free only when no ticket is paid", () => {
  assert.equal(priced(["0", "0"]).is_free, true);
  assert.equal(priced(["0", "0"]).price, undefined);
});

test("with no tickets, the event-level flag is the fallback", () => {
  assert.equal(priced([], { isFree: false }).is_free, false);
  assert.equal(priced([]).is_free, true);
});

test("a big event with no tickets of its own inherits its children's prices", () => {
  const e = priced([], { childEvents: [{ ticketTypes: [{ price: "300" }] }, { ticketTypes: [{ price: "150" }] }] });
  assert.equal(e.price, 150);
  assert.equal(e.is_free, false);
});
