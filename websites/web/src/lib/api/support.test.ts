import { test } from "node:test";
import assert from "node:assert/strict";
import { webLink } from "@/lib/api/support";

test("inbox app links open their web page, or nothing", () => {
  assert.equal(webLink("unifesto://event/tech-fest"), "/event/tech-fest");
  assert.equal(webLink("unifesto://manage/support/abc-1"), "/account/support/abc-1");
  assert.equal(webLink("unifesto://feedback/ev1?x=1"), "/feedback/ev1");
  assert.equal(webLink("unifesto://group/reg-9"), "/tickets/reg-9");
  for (const none of ["unifesto://hackathon/e1", "unifesto://stay/pass/b-1", "unifesto://manage/space/s1", "https://evil.com", "", null]) {
    assert.equal(webLink(none), null, String(none));
  }
});
