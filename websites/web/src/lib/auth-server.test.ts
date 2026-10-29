import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "@/lib/auth-server";

test("sign-in returns only to paths on this site (K18)", () => {
  assert.equal(safeNext("/event/fest/register"), "/event/fest/register");
  assert.equal(safeNext("/tickets?x=1"), "/tickets?x=1");
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", null, undefined]) {
    assert.equal(safeNext(bad), "/tickets", String(bad));
  }
});
