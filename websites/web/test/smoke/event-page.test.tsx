import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import EventDetailPage from "@/app/(public)/event/[slug]/page";
import { mockApi } from "./api";

const nextWeek = Date.now() + 7 * 86_400_000;

test("the public event page renders the event and links Register to checkout", async () => {
  mockApi({
    "GET /events/tech-fest": {
      id: "ev1",
      title: "Tech Fest 2026",
      slug: "tech-fest",
      status: "PUBLISHED",
      type: "IN_PERSON",
      startDateTime: new Date(nextWeek).toISOString(),
      endDateTime: new Date(nextWeek + 3_600_000).toISOString(),
      venueName: "Main Hall",
      city: "Hyderabad",
      space: { id: "s1", name: "Robotics Club", slug: "robotics" },
      ticketTypes: [{ id: "t1", name: "General", price: "499", kind: "INDIVIDUAL" }],
    },
    "GET /config/plan-fees": { buyerFee: 4, buyerFeeCap: 99 },
  });

  render(await EventDetailPage({ params: Promise.resolve({ slug: "tech-fest" }) }));

  expect(screen.getByRole("heading", { level: 1, name: "Tech Fest 2026" })).toBeTruthy();
  const register = screen.getAllByRole("link", { name: /^Register$/ });
  expect(register[0].getAttribute("href")).toBe("/event/tech-fest/register");
});
