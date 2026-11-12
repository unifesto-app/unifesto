import { test } from "node:test";
import assert from "node:assert/strict";
import type { MouseEvent } from "react";
import { APP_STORE_URL, PLAY_STORE_URL, iosAppUrl, openAppOrStore } from "@/lib/appLinks";
import { SITE } from "@/lib/site";

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
  // proxy.ts can't import appLinks.ts (React hooks), so it reads site.ts.
  assert.equal(SITE.appStore, APP_STORE_URL);
  assert.equal(SITE.playStore, PLAY_STORE_URL);
});

test("on iPhone a tapped link follows its own href; elsewhere the script navigates", () => {
  const tap = (userAgent: string) => {
    Object.defineProperty(globalThis, "navigator", { value: { userAgent }, configurable: true });
    const location = { href: "https://www.unifesto.app/event/x", pathname: "/event/x" };
    Object.assign(globalThis, { window: { location } });
    const link = { href: "/download" };
    let prevented = false;
    const e = { currentTarget: link, preventDefault: () => void (prevented = true) } as unknown as MouseEvent<HTMLAnchorElement>;
    openAppOrStore("unifesto://event/x", e);
    return { link: link.href, page: location.href, prevented };
  };
  assert.deepEqual(tap("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), {
    link: "https://unifesto.app/event/x?app=1",
    page: "https://www.unifesto.app/event/x",
    prevented: false,
  });
  const android = tap("Mozilla/5.0 (Linux; Android 15)");
  assert.equal(android.prevented, true);
  assert.match(android.page, /^intent:\/\/event\/x#Intent;scheme=unifesto;package=com\.unifesto\.app;/);
  assert.deepEqual(tap("Mozilla/5.0 (Macintosh)"), { link: "/download", page: "/download?from=%2Fevent%2Fx", prevented: true });
});
