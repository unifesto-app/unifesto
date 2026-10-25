import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { captureUtm, storedUtm, withStoredUtm } from "@/lib/utm";

const store = new Map<string, string>();
const visit = (search: string) => Object.assign(globalThis, { window: { location: { search } } });
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  },
});

beforeEach(() => store.clear());

test("captures utm tags, trimmed and capped at 100 chars", () => {
  visit(`?utm_source=%20insta%20&utm_medium=story&utm_campaign=${"x".repeat(150)}&ref=1`);
  captureUtm();
  assert.deepEqual(storedUtm(), { utmSource: "insta", utmMedium: "story", utmCampaign: "x".repeat(100) });
});

test("an untagged visit keeps the earlier campaign", () => {
  visit("?utm_source=insta");
  captureUtm();
  visit("?utm_medium=only");
  captureUtm();
  assert.equal(storedUtm().utmSource, "insta");
});

test("storedUtm is empty with nothing stored or junk stored", () => {
  assert.deepEqual(storedUtm(), { utmSource: undefined, utmMedium: undefined, utmCampaign: undefined });
  store.set("unifesto.utm", "{not json");
  assert.deepEqual(storedUtm(), {});
});

test("withStoredUtm appends with ? or &, and leaves untagged links alone", () => {
  assert.equal(withStoredUtm("unifesto://event/x"), "unifesto://event/x");
  visit("?utm_source=wa&utm_campaign=fest");
  captureUtm();
  assert.equal(withStoredUtm("unifesto://event/x"), "unifesto://event/x?utm_source=wa&utm_campaign=fest");
  assert.equal(withStoredUtm("unifesto://event/x?a=1"), "unifesto://event/x?a=1&utm_source=wa&utm_campaign=fest");
});
