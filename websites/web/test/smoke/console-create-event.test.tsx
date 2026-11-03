import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import CreateEventPage from "@/app/(console)/console/(dashboard)/events/new/page";
import backendClient from "@/console/lib/api/backend-client";
import { SessionProvider } from "@/console/lib/context/SessionContext";
import { mockApi } from "./api";
import { nav } from "./setup";

test("console creates an event with its RSVP option in the current space", async () => {
  const { calls, adapter } = mockApi({
    "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
    "GET /users/me": { id: "u1", username: "asha", fullName: "Asha Rao", avatarUrl: null, mobileNumber: "+919999999999" },
    "GET /users/me/spaces": [{ id: "s1", name: "Robotics Club", userRole: { code: "SPACE_ADMIN" } }],
    "GET /spaces/s1/access": { spaceRole: "SPACE_ADMIN", eventRole: null, capabilities: ["space:create-event"], plan: null },
    "POST /events": { id: "ev9", title: "Spring Hackathon" },
    "POST /events/ev9/ticket-types": { id: "t9" },
  });
  backendClient.defaults.adapter = adapter;

  render(
    <SessionProvider>
      <CreateEventPage />
    </SessionProvider>,
  );

  fireEvent.change(await screen.findByLabelText("Event name"), { target: { value: "Spring Hackathon" } });
  for (let step = 0; step < 4; step++) fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Create event" }));

  await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/console/events/ev9"));
  expect(calls.find((c) => c.method === "POST" && c.path === "/events")?.body).toMatchObject({
    title: "Spring Hackathon",
    spaceId: "s1",
    registrationType: "RSVP",
  });
  expect(calls.find((c) => c.path === "/events/ev9/ticket-types")?.body).toMatchObject({ kind: "RSVP", price: 0 });
});
