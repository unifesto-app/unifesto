// Self-check for the crew form rules the site and the Unifesto API both rely on.
// The live definition is edited in Unifesto Apex; this uses a sample shaped like it.
// Run: node --experimental-strip-types --no-warnings lib/crewForm.check.ts
import assert from "node:assert/strict";
import { validateSubmission, type CrewFormDef, type FormField } from "./crewForm.ts";

const q = (id: string, type: FormField["type"], required: boolean, options: string[] = []): FormField =>
  ({ id, type, label: id, help: "", placeholder: "", required, options, width: "full", display: "pills" });

const def: CrewFormDef = {
  intro: "", consent: "", submitLabel: "", successTitle: "", successBody: "",
  fields: [
    q("name", "short", true),
    q("email", "email", true),
    q("phone", "phone", true),
    q("city", "short", true),
    q("role", "choice", false, ["Student", "Founder"]),
    q("interests", "multi", true, ["Speaking | Give a talk or join a panel.", "Design | Posters, signage and graphics."]),
    q("availability", "multi", true, ["Weekends", "Remote"]),
    q("experience", "long", false),
    q("links", "url", false),
  ],
};

// A full, valid submission passes and keeps only option labels.
const good = {
  name: " Asha ",
  email: "asha@example.com",
  phone: "+91 98765 43210",
  city: "Hyderabad",
  role: "Student",
  interests: ["Speaking", "Design", "Not an option"],
  availability: ["Weekends"],
  links: "https://example.com",
  stray: "ignored",
};
const ok = validateSubmission(def, good);
assert.deepEqual(ok.errors, {});
assert.equal(ok.clean.name, "Asha");
assert.deepEqual(ok.clean.interests, ["Speaking", "Design"], "unknown and hint text never stored");
assert.ok(!("stray" in ok.clean), "unknown keys dropped");

// Each rule refuses what it should.
const bad = validateSubmission(def, {
  ...good,
  email: "nope",
  phone: "abc",
  role: "Astronaut",
  interests: ["Not an option"],
  links: "example.com",
  experience: "x".repeat(2001),
});
assert.deepEqual(Object.keys(bad.errors).sort(), ["email", "experience", "interests", "links", "phone", "role"]);
assert.ok(validateSubmission(def, {}).errors.name, "required text");

// Types the shipped form doesn't use yet.
const extra: CrewFormDef = {
  ...def,
  fields: [
    { id: "intro", type: "heading", label: "About you", help: "", placeholder: "", required: true, options: [], width: "full", display: "pills" },
    { id: "tee", type: "yesno", label: "Need a tee?", help: "", placeholder: "", required: true, options: [], width: "half", display: "pills" },
    { id: "born", type: "date", label: "Date", help: "", placeholder: "", required: false, options: [], width: "half", display: "pills" },
    { id: "age", type: "number", label: "Age", help: "", placeholder: "", required: false, options: [], width: "half", display: "pills" },
  ],
};
assert.deepEqual(validateSubmission(extra, { tee: "Yes", born: "2001-02-03", age: "21" }).errors, {});
assert.deepEqual(Object.keys(validateSubmission(extra, { tee: "Maybe", born: "3 Feb", age: "old" }).errors).sort(), ["age", "born", "tee"]);
assert.ok(!("intro" in validateSubmission(extra, {}).clean), "headings take no answer");

console.log("crew form: all checks passed");
