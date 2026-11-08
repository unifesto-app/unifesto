import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import AutomationsPage from "@/app/(dashboard)/dashboard/automations/page";
import backendClient from "@/lib/api/backend-client";
import { mockApi } from "./api";

test("Apex lists automatic messages by stage, with each channel's counts", async () => {
  const { calls, adapter } = mockApi({
    "GET /admin/automations": {
      days: 30,
      automations: [
        {
          key: "event.reminder",
          name: "Day-before reminder",
          when: "About 24 hours before the start",
          to: "Attendees",
          group: "Before the event",
          channels: ["push", "inapp", "email"],
          kinds: ["event.reminder"],
          switchable: "event",
          counts: { email: { DELIVERED: 900, OPENED: 300, FAILED: 3 }, push: { SENT: 1100, SKIPPED: 40 } },
          tickets: { push: 2, inapp: 1 },
        },
        {
          key: "payment.failed",
          name: "Payment failed",
          when: "When Razorpay reports a failed payment",
          to: "The payer",
          group: "Booking",
          channels: ["email"],
          kinds: ["payment.failed"],
          counts: {},
          tickets: {},
        },
      ],
    },
  });
  backendClient.defaults.adapter = adapter;

  render(<AutomationsPage />);

  expect(await screen.findByText("Day-before reminder")).toBeTruthy();
  expect(screen.getByText("Before the event")).toBeTruthy();
  expect(screen.getByText("Optional per event")).toBeTruthy();
  expect(screen.getByText("1,200 sent · 300 opened · 3 failed")).toBeTruthy();
  // C19: tickets booked from a tap, the in-app copy on a row of its own.
  expect(screen.getByText("1,100 sent · 40 skipped · 2 tickets")).toBeTruthy();
  expect(screen.getByText("1 ticket")).toBeTruthy();
  expect(screen.getByText("Nothing sent in this period.")).toBeTruthy();
  expect(calls.find((c) => c.path === "/admin/automations")).toBeTruthy();
});
