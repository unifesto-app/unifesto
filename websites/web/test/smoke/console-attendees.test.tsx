import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import EventRegistrationsPage from "@/app/(console)/console/(dashboard)/events/[eventId]/attendees/page";
import backendClient from "@/console/lib/api/backend-client";
import type { Registration } from "@/console/lib/api/registrations-api";
import { mockApi } from "./api";
import { nav } from "./setup";

const asha = {
  id: "reg1",
  eventId: "ev1",
  userId: "u1",
  user: { id: "u1", fullName: "Asha Rao", username: "asha", email: "asha@example.com", avatarUrl: null },
  ticketType: { id: "t1", name: "General", price: 499, currency: "INR" },
  quantity: 1,
  totalAmount: 519,
  razorpayAmount: 519,
  processingFee: 20,
  paymentStatus: "PAID",
  status: "REGISTERED",
  isWaitlisted: false,
  qrCode: "UF-QR-123",
  registeredAt: "2026-11-01T10:00:00.000Z",
} as Registration;

test("console attendee list shows registrations and bulk-checks them in", async () => {
  nav.params = { eventId: "ev1" };
  const { calls, adapter } = mockApi({
    "GET /events/ev1/registrations": { registrations: [asha], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
    "POST /checkin/event/ev1/bulk": { success: [{ id: "reg1", name: "Asha Rao" }], alreadyCheckedIn: [], failed: [] },
  });
  backendClient.defaults.adapter = adapter;
  vi.stubGlobal("confirm", () => true);
  vi.stubGlobal("alert", vi.fn());

  render(<EventRegistrationsPage />);

  expect((await screen.findByRole("link", { name: "Asha Rao" })).getAttribute("href")).toBe(
    "/console/events/ev1/attendees/reg1",
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Asha Rao" }));
  fireEvent.click(screen.getByRole("button", { name: "Check in 1" }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith("Checked in 1."));
  expect(calls.find((c) => c.path === "/checkin/event/ev1/bulk")?.body).toEqual({ registrationIds: ["reg1"] });
});
