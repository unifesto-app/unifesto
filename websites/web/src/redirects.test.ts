import { test } from "node:test";
import assert from "node:assert/strict";

// Old programme links must keep working, and the /orbit 308 must never change:
// browsers have cached it. Unifesto Orbit became Unifesto Encore on 14 Nov 2026.
const { default: config } = await import("../next.config");
const redirects = await config.redirects!();
const to = (source: string) => redirects.find((r) => r.source === source);

test("the cached /orbit redirect is unchanged", () => {
  assert.deepEqual(to("/orbit"), { source: "/orbit", destination: "https://www.wegobeyond.in/orbit", permanent: true });
});

test("old Orbit pages land on their Encore pages", () => {
  for (const [from, dest] of [
    ["/orbit/apply", "/encore/apply"],
    ["/orbit/terms", "/encore/terms"],
    ["/orbit-terms", "/encore/terms"],
    ["/og/orbit/:path*", "/og/encore/:path*"],
  ]) {
    assert.equal(to(from)?.destination, dest, from);
    assert.equal(to(from)?.permanent, true, from);
  }
});
