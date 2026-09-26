"use client";

import { AdminOverview } from "@/components/overview/AdminOverview";

/**
 * The `/dashboard` home — platform-admin mission control. Apex is admin-only
 * (P1.4); AppShell has already bounced organisers to the space app and
 * everyone else to /no-access before this renders.
 */
export default function DashboardPage() {
  return <AdminOverview />;
}
