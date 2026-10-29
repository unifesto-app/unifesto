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

test("space pages sit under Dashboard and the space", () => {
  assert.equal(labels("/console"), "Dashboard");
  assert.equal(labels("/console/space"), "Dashboard › CBIT Coding Club");
  assert.equal(labels("/console/events"), "Dashboard › CBIT Coding Club › Events");
  assert.equal(labels("/console/settings/branding"), "Dashboard › CBIT Coding Club › Settings › Branding");
  assert.equal(labels("/console/events/ev-1/attendees"), "Dashboard › CBIT Coding Club › Events › Tech Fest 2026 › Attendees");
  assert.equal(labels("/console/events/ev-1/attendees/add"), "Dashboard › CBIT Coding Club › Events › Tech Fest 2026 › Attendees › Add");
  assert.equal(labels("/console/events/ev-1/hackathon/judges"), "Dashboard › CBIT Coding Club › Events › Tech Fest 2026 › Sprint › Judges");
  // Before the event layout names it.
  assert.equal(labels("/console/events/ev-2"), "Dashboard › CBIT Coding Club › Events › Event");
  // While the space is loading, no space crumb.
  assert.equal(labels("/console/members", { ...names, space: null }), "Dashboard › Members");
});

test("personal pages sit under Dashboard only, and every crumb links to its own path", () => {
  assert.equal(labels("/console/tickets/reg-9/details"), "Dashboard › My tickets › Ticket › My details");
  assert.equal(labels("/console/account/support/c1"), "Dashboard › My account › Support › Request");
  assert.equal(labels("/console/account/sign-in"), "Dashboard › My account › Sign-in");
  assert.deepEqual(
    trail("/console/events/ev-1/attendees", names).map((c) => c.href),
    ["/console", "/console/space", "/console/events", "/console/events/ev-1", "/console/events/ev-1/attendees"],
  );
});
