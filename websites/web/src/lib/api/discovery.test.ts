import { test } from "node:test";
import assert from "node:assert/strict";
import { browseFacets, trendingEvents, type Event } from "@/lib/api/events";

const day = 86_400_000;
const ev = (id: string, over: Partial<Event> = {}): Event =>
  ({
    id,
    title: id,
    slug: id,
    start_date: new Date(Date.now() + day).toISOString(),
    end_date: new Date(Date.now() + 2 * day).toISOString(),
    event_type: "IN_PERSON",
    is_free: true,
    status: "PUBLISHED",
    is_featured: false,
    is_trending: false,
    created_at: "",
    updated_at: "",
    ...over,
  }) as Event;

test("trending: busiest first, the visitor's city before the rest, nothing past or empty (K1)", () => {
  const list = [
    ev("big-elsewhere", { registered_count: 90, city: "Pune" }),
    ev("small-here", { registered_count: 5, city: "Hyderabad" }),
    ev("none", { registered_count: 0, city: "Hyderabad" }),
    ev("over", { registered_count: 500, end_date: new Date(Date.now() - day).toISOString() }),
  ];
  assert.deepEqual(trendingEvents(list).map((e) => e.id), ["big-elsewhere", "small-here"]);
  assert.deepEqual(trendingEvents(list, "hyderabad").map((e) => e.id), ["small-here", "big-elsewhere"]);
});

test("facets: counted, busiest first, one spelling per city (K1)", () => {
  const f = browseFacets([
    ev("a", { city: "Hyderabad", categories: ["Tech", "Hackathons"], space: { id: "1", name: "IE Cell", slug: "ie" } }),
    ev("b", { city: "hyderabad ", categories: ["Tech"], space: { id: "1", name: "IE Cell", slug: "ie" } }),
    ev("c", { city: "Pune", category: "Music" }),
  ]);
  assert.deepEqual(f.categories, [{ key: "Tech", count: 2 }, { key: "Hackathons", count: 1 }, { key: "Music", count: 1 }]);
  assert.deepEqual(f.cities.map((c) => c.key), ["Hyderabad", "Pune"]);
  assert.deepEqual(f.spaces, [{ key: "ie", count: 2, name: "IE Cell" }]);
});
