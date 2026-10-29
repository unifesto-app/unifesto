import { test } from "node:test";
import assert from "node:assert/strict";
import { trail, type CrumbNames } from "@/console/lib/crumbs";

const names: CrumbNames = {
  space: "CBIT Coding Club",
  section: (p) => ({ events: "Events", members: "Members", settings: "Settings", "settings/branding": "Branding" })[p],
  eventSection: (s) => ({ attendees: "Attendees", hackathon: "Sprint" })[s],
  named: (href) => (href === "/console/events/ev-1" ? "Tech Fest 2026" : undefined),
};
const labels = (path: string, n: CrumbNames = names) => trail(path, n).map((c) => c.label).join(" › ");

test("space pages sit under Home and the space", () => {
  assert.equal(labels("/console"), "Home");
  assert.equal(labels("/console/space"), "Home › CBIT Coding Club");
  assert.equal(labels("/console/events"), "Home › CBIT Coding Club › Events");
  assert.equal(labels("/console/settings/branding"), "Home › CBIT Coding Club › Settings › Branding");
  assert.equal(labels("/console/events/ev-1/attendees"), "Home › CBIT Coding Club › Events › Tech Fest 2026 › Attendees");
  assert.equal(labels("/console/events/ev-1/attendees/add"), "Home › CBIT Coding Club › Events › Tech Fest 2026 › Attendees › Add");
  assert.equal(labels("/console/events/ev-1/hackathon/judges"), "Home › CBIT Coding Club › Events › Tech Fest 2026 › Sprint › Judges");
  // Before the event layout names it.
  assert.equal(labels("/console/events/ev-2"), "Home › CBIT Coding Club › Events › Event");
  // While the space is loading, no space crumb.
  assert.equal(labels("/console/members", { ...names, space: null }), "Home › Members");
});

test("personal pages sit under Home only, and every crumb links to its own path", () => {
  assert.equal(labels("/console/tickets/reg-9/details"), "Home › My tickets › Ticket › My details");
  assert.equal(labels("/console/account/support/c1"), "Home › My account › Support › Request");
  assert.equal(labels("/console/account/sign-in"), "Home › My account › Sign-in");
  assert.deepEqual(
    trail("/console/events/ev-1/attendees", names).map((c) => c.href),
    ["/console", "/console/space", "/console/events", "/console/events/ev-1", "/console/events/ev-1/attendees"],
  );
});
