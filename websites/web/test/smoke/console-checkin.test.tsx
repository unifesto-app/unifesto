import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import EventCheckinPage from "@/app/(console)/console/(dashboard)/events/[eventId]/checkin/page";
import backendClient from "@/console/lib/api/backend-client";
import { mockApi } from "./api";
import { nav } from "./setup";

test("console check-in scans a ticket code in at the selected point", async () => {
  nav.params = { eventId: "ev1" };
  const { calls, adapter } = mockApi({
    "GET /checkin/event/ev1/types": { types: [{ id: "gate", name: "Main gate" }] },
    "GET /checkin/event/ev1/stats": { total: 10, checkedIn: 3, remaining: 7, cancelled: 0, checkInRate: 30 },
    "GET /checkin/event/ev1/recent": [],
    "POST /checkin/scan": {
      attendee: { fullName: "Asha Rao", username: null, avatarUrl: null },
      ticketType: "General",
      alreadyCheckedIn: false,
    },
  });
  backendClient.defaults.adapter = adapter;

  render(<EventCheckinPage />);

  fireEvent.change(await screen.findByPlaceholderText(/ticket code/), { target: { value: "UF-QR-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Check in" }));

  expect(await screen.findByText("Checked in: Asha Rao")).toBeTruthy();
  expect(calls.find((c) => c.path === "/checkin/scan")?.body).toEqual({
    qrCode: "UF-QR-123",
    checkinTypeId: "gate",
    groupAware: true,
  });
});
