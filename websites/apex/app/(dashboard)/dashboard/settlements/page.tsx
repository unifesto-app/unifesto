"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bank, Confetti, Clock, Wallet } from "@phosphor-icons/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getMyPayoutsUnpaginated,
  type Payout,
  type PayoutStatus,
} from "@/lib/api/payouts-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function money(v: number | string): string {
  return `₹${Number(v || 0).toLocaleString("en-IN")}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

const OWED: PayoutStatus[] = ["PENDING", "PROCESSING"];

const STATUS_BADGE: Record<
  PayoutStatus,
  { label: string; variant: "success" | "destructive" | "neutral" | "warning" }
> = {
  PENDING: { label: "Pending", variant: "warning" },
  PROCESSING: { label: "Processing", variant: "neutral" },
  COMPLETED: { label: "Settled", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

/**
 * Organiser surface: settlements owed to and received by the current space.
 * Reads the organiser's own payouts (`GET /payouts/my`) and rolls them up into
 * an earnings view; the settled history lists each completed transfer.
 */
export default function SettlementsPage() {
  const { currentSpace } = useSession();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getMyPayoutsUnpaginated();
    if (error) setError(error.message);
    else setPayouts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const now = new Date();
    let pending = 0;
    let settled = 0;
    let thisMonth = 0;
    for (const p of payouts) {
      if (OWED.includes(p.status)) pending += Number(p.netAmount);
      if (p.status === "COMPLETED") {
        settled += Number(p.netAmount);
        if (p.completedAt) {
          const d = new Date(p.completedAt);
          if (
            d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear()
          ) {
            thisMonth += Number(p.netAmount);
          }
        }
      }
    }
    return { pending, settled, thisMonth };
  }, [payouts]);

  // Completed transfers, newest first — the settlement history.
  const history = useMemo(
    () =>
      payouts
        .filter((p) => p.status === "COMPLETED")
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.createdAt).getTime() -
            new Date(a.completedAt ?? a.createdAt).getTime()
        ),
    [payouts]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settlements"
        subtitle={`What ${currentSpace?.name ?? "your space"} has earned and been paid`}
      />

      {error && <ErrorNotice message={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Pending"
          value={money(summary.pending)}
          hint="Owed for your events"
          icon={Clock}
          tone="brand"
          loading={loading}
        />
        <StatCard
          title="This month"
          value={money(summary.thisMonth)}
          hint="Settled this month"
          icon={Wallet}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Settled to date"
          value={money(summary.settled)}
          hint="Total received"
          icon={Bank}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement history</CardTitle>
          <CardDescription>
            Each settlement you receive is listed here with its event, amount,
            and bank reference.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              icon={Confetti}
              tone="positive"
              title="Your earnings will land here"
              description="Once your paid events wrap up, settlements move to your balance and appear in this history."
            />
          ) : (
            <div className="divide-y">
              {history.map((p) => {
                const badge = STATUS_BADGE[p.status];
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {p.event?.title ?? "Event"}
                        </p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(p.completedAt)}
                        {p.utr && ` · UTR ${p.utr}`}
                        {p.bankAccount &&
                          (p.bankAccount.methodType === "UPI"
                            ? ` · UPI ${p.bankAccount.upiId ?? ""}`
                            : ` · ${p.bankAccount.bankName ?? "Bank"} ····${(p.bankAccount.accountNumber ?? "").slice(-4)}`)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{money(p.netAmount)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
