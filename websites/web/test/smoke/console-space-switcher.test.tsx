import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { RailHeader } from "@/console/components/shell/RailChrome";
import backendClient from "@/console/lib/api/backend-client";
import { SessionProvider } from "@/console/lib/context/SessionContext";
import { mockApi } from "./api";
import { nav } from "./setup";

const signedIn = (spaces: object[]) => ({
  "POST /auth/session": { accessToken: "tok", email: "asha@example.com", fullName: "Asha Rao" },
  "GET /users/me": { id: "u1", username: "asha", fullName: "Asha Rao", avatarUrl: null, mobileNumber: "+919999999999" },
  "GET /users/me/spaces": spaces,
  "GET /spaces/s1/access": { spaceRole: "SPACE_ADMIN", eventRole: null, capabilities: [], plan: null },
  "GET /spaces/s2/access": { spaceRole: "CURATOR", eventRole: null, capabilities: [], plan: null },
});

test("Q43: the rail's switcher opens another space in two clicks", async () => {
  const { adapter } = mockApi(
    signedIn([
      { id: "s1", name: "Robotics Club", userRole: { code: "SPACE_ADMIN" } },
      { id: "s2", name: "E-Cell", userRole: { code: "CURATOR" } },
    ]),
  );
  backendClient.defaults.adapter = adapter;

  render(
    <SessionProvider>
      <RailHeader />
    </SessionProvider>,
  );

  // Click 1: the current space opens the list, with itself marked.
  fireEvent.click(await screen.findByText("Switch space"));
  expect(screen.getByRole("button", { name: /Robotics Club/ }).getAttribute("aria-current")).toBe("true");

  // Click 2: another space becomes the console's space and its dashboard opens.
  fireEvent.click(screen.getByRole("button", { name: /E-Cell/ }));
  await waitFor(() => expect(nav.router.push).toHaveBeenCalledWith("/console/space"));
  expect(localStorage.getItem("space_current_space_id")).toBe("s2");
  expect(screen.getByRole("link", { name: "All my spaces" }).getAttribute("href")).toBe("/console/spaces");
});

test("Q43: no switcher for someone who runs no space", async () => {
  const { calls, adapter } = mockApi(signedIn([]));
  backendClient.defaults.adapter = adapter;

  render(
    <SessionProvider>
      <RailHeader />
    </SessionProvider>,
  );

  await waitFor(() => expect(calls.some((c) => c.path === "/users/me/spaces")).toBe(true));
  expect(screen.queryByText("Switch space")).toBeNull();
});
