import { test } from "node:test";
import assert from "node:assert/strict";
import { mapEvent, outsideRegistration } from "@/lib/api/events";

test("names an outside https link by its host", () => {
  assert.deepEqual(outsideRegistration({ external_registration_url: "https://www.unstop.com/hackathons/x" }), {
    href: "https://www.unstop.com/hackathons/x",
    host: "unstop.com",
  });
});

test("ignores anything that isn't https", () => {
  for (const raw of [null, undefined, "", "http://forms.gle/x", "javascript:alert(1)", "not a url"]) {
    assert.equal(outsideRegistration({ external_registration_url: raw }), null, String(raw));
  }
});

test("an event that registers elsewhere is never mapped as free", () => {
  const raw = { id: "e", title: "T", slug: "t", startDateTime: "2026-12-06T07:30:00Z", isFree: true, ticketTypes: [] };
  assert.equal(mapEvent(raw)?.is_free, true);
  const outside = mapEvent({ ...raw, externalRegistrationUrl: "https://forms.gle/x" });
  assert.equal(outside?.is_free, false);
  assert.equal(outside?.external_registration_url, "https://forms.gle/x");
});
