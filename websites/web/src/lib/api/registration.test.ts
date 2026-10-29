import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleFieldIds, type FormField } from "@/lib/api/registration";

const field = (id: string, order: number, extra: Partial<FormField> = {}): FormField => ({
  id, order, ticketTypeId: null, label: id, type: "TEXT", options: [], isRequired: false, helpText: null, config: null, showIf: null, perGroup: false, ...extra,
});
const ids = (s: Set<string>) => [...s].sort();

test("fields without show-if are always visible", () => {
  assert.deepEqual(ids(visibleFieldIds([field("a", 1), field("b", 2)], {})), ["a", "b"]);
});

test("a child shows only when the parent's answer matches", () => {
  const fields = [field("diet", 1, { type: "SELECT" }), field("allergy", 2, { showIf: { fieldId: "diet", anyOf: ["Vegan", "Other"] } })];
  assert.deepEqual(ids(visibleFieldIds(fields, {})), ["diet"]);
  assert.deepEqual(ids(visibleFieldIds(fields, { diet: "Veg" })), ["diet"]);
  assert.deepEqual(ids(visibleFieldIds(fields, { diet: "Other" })), ["allergy", "diet"]);
});

test("checkbox answers match on any option; YES_NO maps booleans", () => {
  const fields = [
    field("tracks", 1, { type: "CHECKBOX" }),
    field("ai", 2, { showIf: { fieldId: "tracks", anyOf: ["AI"] } }),
    field("team", 3, { type: "YES_NO" }),
    field("solo", 4, { showIf: { fieldId: "team", anyOf: ["No"] } }),
  ];
  assert.deepEqual(ids(visibleFieldIds(fields, { tracks: ["Web", "AI"], team: false })), ["ai", "solo", "team", "tracks"]);
  assert.deepEqual(ids(visibleFieldIds(fields, { tracks: ["Web"], team: true })), ["team", "tracks"]);
});

test("a hidden parent hides its children, whatever the stale answer", () => {
  const fields = [
    field("c", 3, { showIf: { fieldId: "b", anyOf: ["x"] } }),
    field("a", 1, { type: "YES_NO" }),
    field("b", 2, { showIf: { fieldId: "a", anyOf: ["Yes"] } }),
  ];
  assert.deepEqual(ids(visibleFieldIds(fields, { a: true, b: "x" })), ["a", "b", "c"]);
  assert.deepEqual(ids(visibleFieldIds(fields, { a: false, b: "x" })), ["a"]);
});

test("a show-if pointing at a deleted field falls back to visible", () => {
  assert.deepEqual(ids(visibleFieldIds([field("a", 1, { showIf: { fieldId: "gone", anyOf: ["x"] } })], {})), ["a"]);
});
