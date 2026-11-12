import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { captureUtm, returnLink, safeReturnUrl, storedReturn, storedUtm, withStoredUtm } from "@/lib/utm";

const store = new Map<string, string>();
const visit = (search: string, pathname = "/") => Object.assign(globalThis, { window: { location: { search, pathname } } });
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

test("an email click's nid rides with the order and into the app, apart from the utm tags (C19)", () => {
  visit("?utm_source=insta");
  captureUtm();
  visit("?nid=e%3Ac1");
  captureUtm();
  assert.deepEqual(storedUtm(), { utmSource: "insta", utmMedium: undefined, utmCampaign: undefined, sourceNid: "e:c1" });
  assert.equal(withStoredUtm("unifesto://event/x"), "unifesto://event/x?utm_source=insta&nid=e%3Ac1");
  visit("?nid=%3Cscript%3E");
  captureUtm();
  assert.equal(storedUtm().sourceNid, "e:c1");
});

test("withStoredUtm appends with ? or &, and leaves untagged links alone", () => {
  assert.equal(withStoredUtm("unifesto://event/x"), "unifesto://event/x");
  visit("?utm_source=wa&utm_campaign=fest");
  captureUtm();
  assert.equal(withStoredUtm("unifesto://event/x"), "unifesto://event/x?utm_source=wa&utm_campaign=fest");
  assert.equal(withStoredUtm("unifesto://event/x?a=1"), "unifesto://event/x?a=1&utm_source=wa&utm_campaign=fest");
});

test("safeReturnUrl keeps a public https page and names its host", () => {
  assert.deepEqual(safeReturnUrl("https://www.wegobeyond.in/build-sunday?x=1#top"), {
    href: "https://www.wegobeyond.in/build-sunday?x=1",
    host: "wegobeyond.in",
  });
});

test("safeReturnUrl refuses anything that isn't a plain https page", () => {
  for (const raw of [
    null,
    "",
    "http://wegobeyond.in",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//wegobeyond.in",
    "https://user:pw@wegobeyond.in",
    "https://localhost/x",
    "https://intranet/x",
    "https://localhost./x",
    "https://printer.local/x",
    "https://10.0.0.5/x",
    "https://[::1]/x",
    `https://${"a".repeat(55)}.evil.com/`,
    `https://wegobeyond.in/${"a".repeat(500)}`,
  ]) {
    assert.equal(safeReturnUrl(raw), null, String(raw));
  }
});

test("a return link is kept for the event it landed on, and only that one", () => {
  visit("?utm_source=wegobeyond&return=https%3A%2F%2Fwegobeyond.in%2F", "/event/build-sunday/register");
  captureUtm();
  assert.equal(storedReturn("build-sunday")?.host, "wegobeyond.in");
  assert.equal(storedReturn("other-event"), null);
  visit("?return=javascript%3Aalert(1)", "/event/build-sunday");
  captureUtm();
  assert.equal(storedReturn("build-sunday")?.host, "wegobeyond.in");
  visit("?return=https%3A%2F%2Fwegobeyond.in%2F", "/events");
  store.clear();
  captureUtm();
  assert.equal(storedReturn("build-sunday"), null);
});

test("an embed landing keeps embed, popup and where it came from; the way back carries the marker", () => {
  Object.assign(globalThis, { document: { referrer: "https://wegobeyond.in/build-sunday" } });
  visit("?utm_source=wegobeyond&embed=1&popup=1&return=https%3A%2F%2Fwegobeyond.in%2Fbuild-sunday", "/event/build-sunday/register");
  captureUtm();
  const r = storedReturn("build-sunday")!;
  assert.equal(r.embed, true);
  assert.equal(r.popup, true);
  assert.equal(returnLink(r, "build-sunday"), "https://wegobeyond.in/build-sunday#unifesto=registered&event=build-sunday&popup=1");
  // A plain tagged link (no embed.js) goes back with no marker and never on its own.
  visit("?return=https%3A%2F%2Fwegobeyond.in%2F", "/event/build-sunday");
  captureUtm();
  const plain = storedReturn("build-sunday")!;
  assert.equal(returnLink(plain, "build-sunday"), "https://wegobeyond.in/");
  assert.equal(plain.auto, false);
  Object.assign(globalThis, { document: undefined });
});
