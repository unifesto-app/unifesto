import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, buyerFeeOn, passExample, planIncludes, platformFeeFrom } from "@/lib/site";

test("the ₹500 pass example: students pay ₹525, Starter keeps ₹487.50", () => {
  assert.equal(
    passExample(PLANS[0], 5, 99, null),
    "A ₹500 pass: students pay ₹525, or ₹500 if you include the fee. You keep ₹487.50 on Starter.",
  );
});

test("before go-live the keep line is dated", () => {
  assert.match(passExample(PLANS[0], 5, 99, "2 Nov 2026"), /From 2 Nov 2026 you keep ₹487.50/);
});

test("the buyer fee caps at ₹99 per ticket", () => {
  assert.equal(buyerFeeOn(3000, 5, 99), 99);
  assert.equal(buyerFeeOn(3000, 5, null), 150);
});

test("platform fee is dated only until 2 Nov 2026 IST", () => {
  assert.equal(platformFeeFrom(new Date("2026-11-01T18:29:00Z")), "2 Nov 2026");
  assert.equal(platformFeeFrom(new Date("2026-11-01T18:30:00Z")), null);
});

test("plan lists come from plan_configs: limits, then only the features the previous plan lacks", () => {
  const [starter, pro] = PLANS;
  const s = { eventsPerMonth: 2, attendeesPerEvent: 100, hasWaitlist: false, hasRemoveBranding: false };
  const p = { eventsPerMonth: null, attendeesPerEvent: 1000, hasWaitlist: true, hasRemoveBranding: true };
  assert.equal(planIncludes(starter, s)[0], "2 events a month, up to 100 attendees each");
  assert.deepEqual(planIncludes(pro, p, { plan: starter, row: s }), [
    "Everything in Starter",
    "Unlimited events a month, up to 1,000 attendees each",
    "Waitlists",
    "Remove Unifesto branding",
  ]);
});
