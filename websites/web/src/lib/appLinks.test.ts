import { test } from "node:test";
import assert from "node:assert/strict";
import { APP_STORE_URL, iosAppUrl } from "@/lib/appLinks";

test("iPhone app links use the bare host and carry the App Store marker", () => {
  assert.equal(iosAppUrl("unifesto://event/tech-fest"), "https://unifesto.app/event/tech-fest?app=1");
  assert.equal(iosAppUrl("unifesto://event/x?utm_source=wa"), "https://unifesto.app/event/x?utm_source=wa&app=1");
  assert.equal(iosAppUrl("unifesto://space/acme"), "https://unifesto.app/space/acme?app=1");
  assert.equal(iosAppUrl("unifesto://claim/t0k"), "https://unifesto.app/claim/t0k?app=1");
  assert.equal(iosAppUrl("unifesto://qr/ab-12"), "https://unifesto.app/qr/ab-12?app=1");
});

test("paths the AASA doesn't list go straight to the App Store", () => {
  for (const scheme of ["unifesto://ticket/r1", "unifesto://tickets", "unifesto://signup", "unifesto://events/x", "nonsense"]) {
    assert.equal(iosAppUrl(scheme), APP_STORE_URL, scheme);
  }
});
