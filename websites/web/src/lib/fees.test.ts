import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, buyerFeeOn, includedFeeOn, passExample, planIncludes, platformFeeFrom } from "@/lib/site";

test("the ₹500 pass example: students pay ₹520, General keeps ₹487.50", () => {
  assert.equal(
    passExample(PLANS[0], 4, 99, null),
    "A ₹500 pass: students pay ₹520, or ₹500 if you include the fee. You keep ₹487.50 on General.",
  );
});

test("before go-live the keep line is dated", () => {
  assert.match(passExample(PLANS[0], 4, 99, "2 Nov 2026"), /From 2 Nov 2026 you keep ₹487.50/);
});

test("an included fee comes out of the price: a ₹500 ticket gets you ₹480.77", () => {
  assert.equal(includedFeeOn(500, 4, 99), 19.23);
  assert.equal(includedFeeOn(5000, 4, 99), 99);
});

test("the buyer fee caps at ₹99 per ticket", () => {
  assert.equal(buyerFeeOn(3000, 4, 99), 99);
  assert.equal(buyerFeeOn(3000, 4, null), 120);
});

test("platform fee is dated only until 2 Nov 2026 IST", () => {
  assert.equal(platformFeeFrom(new Date("2026-11-01T18:29:00Z")), "2 Nov 2026");
  assert.equal(platformFeeFrom(new Date("2026-11-01T18:30:00Z")), null);
});

test("plan lists come from plan_configs: limits, then only the features the previous plan lacks", () => {
  const [general, club] = PLANS;
  const s = { eventsPerMonth: 2, attendeesPerEvent: 100, hasWaitlist: false, hasRemoveBranding: false };
  const p = { eventsPerMonth: null, attendeesPerEvent: 1000, hasWaitlist: true, hasRemoveBranding: true };
  assert.equal(planIncludes(general, s)[0], "2 events a month, up to 100 attendees each");
  assert.deepEqual(planIncludes(club, p, { plan: general, row: s }), [
    "Everything in General",
    "Unlimited events a month, up to 1,000 attendees each",
    "Waiting list with pay-to-claim offers",
    "White-label: colours, logo, favicon, own email and domain",
  ]);
});
