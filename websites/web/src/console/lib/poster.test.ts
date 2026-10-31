import { test } from "node:test";
import assert from "node:assert/strict";
import { wrap } from "@/console/lib/poster";

// One unit per character, so widths are easy to reason about.
const ctx = { measureText: (s: string) => ({ width: s.length }) as TextMetrics };

test("the poster title wraps on words and cuts the last line with an ellipsis", () => {
  assert.deepEqual(wrap(ctx, "Tech Fest 2026", 20, 3), ["Tech Fest 2026"]);
  assert.deepEqual(wrap(ctx, "Tech Fest 2026", 9, 3), ["Tech Fest", "2026"]);
  assert.deepEqual(wrap(ctx, "a b c d", 1, 2), ["a", "b…"]);
  // A word longer than the width still gets its own line rather than vanishing.
  assert.deepEqual(wrap(ctx, "Supercalifragilistic day", 10, 3), ["Supercalifragilistic", "day"]);
});
