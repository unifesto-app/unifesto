import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import NewCampaignPage from "@/app/(console)/console/(dashboard)/campaigns/new/page";
import backendClient from "@/console/lib/api/backend-client";
import { SessionProvider } from "@/console/lib/context/SessionContext";
import { mockApi } from "./api";
import { nav } from "./setup";

test("console sends a space campaign as a notification to its members", async () => {
  const { calls, adapter } = mockApi({
    "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
    "GET /users/me": { id: "u1", username: "asha", fullName: "Asha Rao", avatarUrl: null, mobileNumber: "+919999999999" },
    "GET /users/me/spaces": [{ id: "s1", name: "Robotics Club", userRole: { code: "SPACE_ADMIN" } }],
    "GET /spaces/s1/access": { spaceRole: "SPACE_ADMIN", eventRole: null, capabilities: ["space:manage-email"], plan: null },
    "POST /spaces/s1/campaigns": { id: "c1", status: "SENT", error: null },
  });
  backendClient.defaults.adapter = adapter;
  vi.stubGlobal("confirm", () => true);

  render(
    <SessionProvider>
      <NewCampaignPage />
    </SessionProvider>,
  );

  fireEvent.click(await screen.findByRole("checkbox", { name: "Also send it as an email" }));
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Build night on Friday" } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Lab 2, from 6 PM. Bring a laptop." } });
  fireEvent.click(screen.getByRole("button", { name: "Send now" }));

  await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/console/campaigns"));
  expect(calls.find((c) => c.method === "POST" && c.path === "/spaces/s1/campaigns")?.body).toEqual({
    channels: ["push"],
    push: { title: "Build night on Friday", body: "Lab 2, from 6 PM. Bring a laptop." },
    audience: { type: "space" },
  });
});

test("Write with AI fills the organiser's notification from one line", async () => {
  const { calls, adapter } = mockApi({
    "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
    "GET /users/me": { id: "u1", username: "asha", fullName: "Asha Rao", avatarUrl: null, mobileNumber: "+919999999999" },
    "GET /users/me/spaces": [{ id: "s1", name: "Robotics Club", userRole: { code: "SPACE_ADMIN" } }],
    "GET /spaces/s1/access": { spaceRole: "SPACE_ADMIN", eventRole: null, capabilities: ["space:manage-email"], plan: null },
    "POST /spaces/s1/campaigns/draft": {
      ok: true,
      draft: { push: { title: "Build night moves to Lab 2", body: "Same time, 6 PM. See you there." } },
    },
  });
  backendClient.defaults.adapter = adapter;

  render(
    <SessionProvider>
      <NewCampaignPage />
    </SessionProvider>,
  );

  fireEvent.click(await screen.findByRole("checkbox", { name: "Also send it as an email" }));
  fireEvent.change(screen.getByLabelText("What to tell people"), { target: { value: "build night moved to lab 2" } });
  fireEvent.click(screen.getByRole("button", { name: "Draft it" }));

  expect(await screen.findByDisplayValue("Build night moves to Lab 2")).toBeTruthy();
  expect(screen.getByDisplayValue("Same time, 6 PM. See you there.")).toBeTruthy();
  expect(calls.find((c) => c.path === "/spaces/s1/campaigns/draft")?.body).toEqual({
    line: "build night moved to lab 2",
    channels: ["push"],
  });
});
