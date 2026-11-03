import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import FinancialsPage from "@/app/(dashboard)/dashboard/financials/page";
import backendClient from "@/lib/api/backend-client";
import type { FinancialsFigures, PlatformFinancialsBreakdown } from "@/lib/api/payouts-api";
import { mockApi } from "./api";

const figures = (collectedOverall: number): FinancialsFigures => ({
  collectedOverall,
  processingFees: collectedOverall * 0.04,
  ticketRevenue: collectedOverall * 0.96,
  refunded: 0,
  platformFee: 0,
  netEntitlement: collectedOverall * 0.96,
  settled: 0,
  pending: 0,
  available: collectedOverall * 0.96,
  overdrawn: 0,
});

const breakdown: PlatformFinancialsBreakdown = {
  totals: { ...figures(455000), gatewayFees: 9100, platformEarnings: 9100 },
  spaces: [
    {
      ...figures(300000),
      spaceId: "s1",
      name: "Robotics Club",
      slug: "robotics",
      feePercent: 0,
      plan: null,
      eventCount: 1,
      gatewayFees: 6000,
      platformEarnings: 6000,
      events: [{ ...figures(300000), eventId: "ev1", title: "Tech Fest 2026", slug: "tech-fest", startDateTime: "2026-11-10T10:00:00.000Z" }],
    },
  ],
};

test("Apex financials shows platform totals and drills into a space's events", async () => {
  const { adapter } = mockApi({ "GET /payouts/admin/financials/breakdown": breakdown });
  backendClient.defaults.adapter = adapter;

  render(<FinancialsPage />);

  expect(await screen.findByText("₹4,55,000")).toBeTruthy();
  fireEvent.click(screen.getByText("Robotics Club"));
  expect(screen.getByText("Tech Fest 2026")).toBeTruthy();
});
