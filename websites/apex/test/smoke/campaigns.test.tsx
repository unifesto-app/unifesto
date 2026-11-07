import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import CampaignsPage from "@/app/(dashboard)/dashboard/campaigns/page";
import backendClient from "@/lib/api/backend-client";
import type { Campaign } from "@/lib/api/campaigns-api";
import { mockApi } from "./api";

const sent = {
  id: "c1",
  channels: ["push", "email"],
  category: "productUpdates",
  audience: { type: "all" },
  content: { push: { title: "Hack Night is on", body: "Friday, 7 PM" }, email: { subject: "Hack Night", html: "<p>x</p>" } },
  status: "SENT",
  scheduledAt: null,
  sentAt: "2026-11-07T10:00:00.000Z",
  error: null,
  recipientCount: 150,
  createdAt: "2026-11-07T10:00:00.000Z",
  counts: { push: { SENT: 120, SKIPPED: 30 }, email: { DELIVERED: 60, OPENED: 40, FAILED: 2 } },
} as Campaign;

test("Apex sends one campaign and shows each channel's counts", async () => {
  const { calls, adapter } = mockApi({
    "GET /admin/campaigns": { campaigns: [sent], total: 1, page: 1, limit: 20 },
    "GET /admin/platform-config": { commsPaused: false },
    "POST /admin/campaigns": { ...sent, id: "c2" },
  });
  backendClient.defaults.adapter = adapter;
  vi.stubGlobal("confirm", () => true);

  render(<CampaignsPage />);

  expect(await screen.findByText("Hack Night is on")).toBeTruthy();
  expect(screen.getByText("120 sent · 30 skipped")).toBeTruthy();
  expect(screen.getByText("100 sent · 40 opened · 2 failed")).toBeTruthy();

  fireEvent.click(screen.getAllByRole("button", { name: /New campaign/ })[0]);
  fireEvent.change(await screen.findByLabelText("Push title"), { target: { value: "Doors open at 6" } });
  fireEvent.change(screen.getByLabelText("Push message"), { target: { value: "Bring your ticket." } });
  fireEvent.click(screen.getByRole("button", { name: "Send now" }));

  await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/admin/campaigns")).toBe(true));
  expect(calls.find((c) => c.method === "POST" && c.path === "/admin/campaigns")?.body).toEqual({
    channels: ["push"],
    category: "productUpdates",
    push: { title: "Doors open at 6", body: "Bring your ticket." },
    audience: { type: "all" },
  });
});
