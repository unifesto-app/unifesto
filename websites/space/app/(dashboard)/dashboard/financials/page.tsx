"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChartBar,
  Money,
  ArrowsClockwise,
  Bank,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewPanel } from "@/components/finance/OverviewPanel";
import { PayoutsPanel } from "@/components/finance/PayoutsPanel";
import { RefundsPanel } from "@/components/finance/RefundsPanel";
import { BankAccountsPanel } from "@/components/finance/BankAccountsPanel";

const TABS = [
  { value: "overview", label: "Overview", icon: ChartBar },
  { value: "payouts", label: "Payouts", icon: Money },
  { value: "refunds", label: "Refunds", icon: ArrowsClockwise },
  { value: "accounts", label: "Accounts", icon: Bank },
] as const;

type TabValue = (typeof TABS)[number]["value"];

function isTab(v: string | null): v is TabValue {
  return TABS.some((t) => t.value === v);
}

function FinanceTabs() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("tab");
  const [tab, setTab] = useState<TabValue>(isTab(initial) ? initial : "overview");

  const onChange = (v: string) => {
    setTab(v as TabValue);
    // Keep the tab shareable/back-navigable without a full reload.
    const q = v === "overview" ? "" : `?tab=${v}`;
    router.replace(`/dashboard/financials${q}`, { scroll: false });
  };

  return (
    <Tabs value={tab} onValueChange={onChange} className="space-y-6">
      <TabsList className="h-auto flex-wrap justify-start">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
            <t.icon className="h-4 w-4" weight="duotone" />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview">
        <OverviewPanel onRequestPayout={() => onChange("payouts")} />
      </TabsContent>
      <TabsContent value="payouts">
        <PayoutsPanel />
      </TabsContent>
      <TabsContent value="refunds">
        <RefundsPanel />
      </TabsContent>
      <TabsContent value="accounts">
        <BankAccountsPanel />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Unified Finance workspace — earnings overview with graphs, payouts, refunds,
 * and payout accounts, all under one page. Replaces the separate Financials /
 * Payouts / Refunds / Bank-account routes (which now redirect here).
 */
export default function FinancePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Finance"
        subtitle="Your earnings at a glance — track revenue, request payouts, review refunds, and manage payout accounts."
      />
      <Suspense fallback={null}>
        <FinanceTabs />
      </Suspense>
    </div>
  );
}
