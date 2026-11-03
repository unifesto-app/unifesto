import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import SpaceRequestsPage from "@/app/(dashboard)/dashboard/requests/page";
import backendClient from "@/lib/api/backend-client";
import type { SpaceRequest } from "@/lib/api/requests-api";
import { mockApi } from "./api";

const request = {
  id: "req1",
  name: "Robotics Club",
  description: "Builds robots on campus.",
  type: "CLUB",
  visibility: "PUBLIC",
  city: "Hyderabad",
  state: "Telangana",
  country: "India",
  tags: [],
  websiteUrl: null,
  status: "PENDING",
  reviewNote: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  user: { id: "u1", fullName: "Asha Rao", username: "asha" },
} as SpaceRequest;

test("Apex approves a pending space request", async () => {
  const { calls, adapter } = mockApi({
    "GET /spaces/requests": [request],
    "PATCH /spaces/requests/req1/approve": { id: "req1", status: "APPROVED" },
  });
  backendClient.defaults.adapter = adapter;
  vi.stubGlobal("confirm", () => true);

  render(<SpaceRequestsPage />);

  expect(await screen.findByText("Robotics Club")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));

  await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.path === "/spaces/requests/req1/approve")).toBe(true));
});
