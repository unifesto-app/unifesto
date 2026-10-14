"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getReconSummary,
  getReconBalance,
  getReconPayments,
  getReconSettlements,
  getReconRefunds,
  type ReconSummary,
  type ReconBalance,
  type ReconPayments,
  type ReconSettlements,
  type ReconRefunds,
  type ReconPaymentStatus,
  type ReconPaymentRow,
} from "@/lib/api/reconciliation-api";
import { getAllPayoutsUnpaginated, type Payout } from "@/lib/api/payouts-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const money = (v: number | string | null | undefined) =>
  v === null || v === undefined ? "—" : `₹${Number(v).toLocaleString("en-IN")}`;
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** YYYY-MM-DD for an <input type=date>, N days back from today. */
function isoDaysAgo(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

const STATUS_BADGE: Record<
  ReconPaymentStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "neutral" }
> = {
  MATCHED: { label: "Matched", variant: "success" },
  MISSING_IN_PLATFORM: { label: "Not in platform", variant: "destructive" },
  MISSING_IN_RAZORPAY: { label: "Not in Razorpay", variant: "warning" },
  RAZORPAY_UNCAPTURED: { label: "Uncaptured", variant: "neutral" },
};

export default function ReconciliationPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  // Applied range — only changes when "Apply" is pressed, so typing doesn't refetch.
  const [range, setRange] = useState({ from: isoDaysAgo(30), to: isoDaysAgo(0) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reconciliation"
        subtitle="Platform ledger vs Razorpay — payments, refunds, and settlements to your bank. Fetched live from Razorpay for the selected window."
      />

      {/* Date window — shared across every tab. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <Button onClick={() => setRange({ from, to })}>Apply</Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab range={range} />
        </TabsContent>
        <TabsContent value="payments" className="mt-6">
          <PaymentsTab range={range} />
        </TabsContent>
        <TabsContent value="settlements" className="mt-6">
          <SettlementsTab range={range} />
        </TabsContent>
        <TabsContent value="refunds" className="mt-6">
          <RefundsTab range={range} />
        </TabsContent>
        <TabsContent value="payouts" className="mt-6">
          <PayoutsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Small labelled figure tile. */
function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "danger" ? "text-destructive" : tone === "ok" ? "text-success" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function useReconData<T>(loader: () => Promise<{ data: T | null; error: { message: string } | null }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void run().then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) setError(error.message);
      else setData(data);
    });
    return () => {
      active = false;
    };
  }, [run]);
  return { data, loading, error };
}

/**
 * Money still held at Razorpay (not yet settled to the bank). All-time and
 * window-independent, so it loads on its own — the full-history sweep is slower
 * than the windowed tiles and shouldn't block them.
 */
function BalanceCard() {
  const [data, setData] = useState<ReconBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getReconBalance().then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) setError(error.message);
      else setData(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <Card className="border-primary/30">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Balance held at Razorpay (not yet settled)</p>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-40 rounded-md" />
          ) : error ? (
            <p className="mt-1 text-sm text-destructive">{error}</p>
          ) : data ? (
            <>
              <p className="mt-1 text-3xl font-semibold text-foreground">
                {money(data.balance)}
                {data.approximate && <span className="ml-1 align-middle text-xs text-muted-foreground">(est.)</span>}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                As of {fmtDateTime(data.asOf)}. All-time captured − fees − refunds − settled.
              </p>
            </>
          ) : null}
        </div>
        {data && !loading && !error && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:text-right">
            <span className="text-muted-foreground">Captured</span>
            <span className="font-medium text-foreground">{money(data.captured)}</span>
            <span className="text-muted-foreground">Fees + GST</span>
            <span className="font-medium text-foreground">−{money(data.fees)}</span>
            <span className="text-muted-foreground">Refunded</span>
            <span className="font-medium text-foreground">−{money(data.refunded)}</span>
            <span className="text-muted-foreground">Settled to bank</span>
            <span className="font-medium text-foreground">−{money(data.settled)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ range }: { range: { from: string; to: string } }) {
  // Balance (all-time sweep) loads independently of the windowed summary so the
  // slower call doesn't hold up the tiles.
  return (
    <div className="space-y-6">
      <BalanceCard />
      <SummarySection range={range} />
    </div>
  );
}

function SummarySection({ range }: { range: { from: string; to: string } }) {
  const { data, loading, error } = useReconData<ReconSummary>(
    () => getReconSummary(range),
    [range.from, range.to]
  );

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorNotice message={error} />;
  if (!data) return null;

  const capturedOff = Math.abs(data.diff.captured) > 1;
  const refundOff = Math.abs(data.diff.refunded) > 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Razorpay captured" value={money(data.razorpay.captured)} hint={`${data.razorpay.capturedCount} payments`} />
        <Tile label="Platform captured" value={money(data.platform.captured)} hint={`${data.platform.paidCount} paid records`} />
        <Tile
          label="Captured difference"
          value={money(data.diff.captured)}
          tone={capturedOff ? "danger" : "ok"}
          hint={capturedOff ? "Razorpay ≠ platform" : "In sync"}
        />
        <Tile label="Settled to bank" value={money(data.razorpay.settledToBank)} hint={`${data.razorpay.settlementCount} settlements`} tone="ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Razorpay</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Captured" value={money(data.razorpay.captured)} />
            <Row label="Refunded" value={`−${money(data.razorpay.refunded)}`} />
            <Row label="Razorpay fees + GST" value={`−${money(data.razorpay.fees)}`} />
            <Row label="Net (≈ should settle)" value={money(data.razorpay.net)} strong />
            <Row label="Actually settled to bank" value={money(data.razorpay.settledToBank)} strong />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Platform ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Captured (razorpay amount)" value={money(data.platform.captured)} />
            <Row label="Refunded (matched to Razorpay)" value={`−${money(data.platform.refunded)}`} />
            <Row label="Processing fees collected" value={money(data.platform.processingFees)} />
            <Row label="Captured difference vs Razorpay" value={money(data.diff.captured)} strong danger={capturedOff} />
            <Row label="Refund difference (unrecorded)" value={money(data.diff.refunded)} strong danger={refundOff} />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Window: {fmtDate(data.window.from)} — {fmtDate(data.window.to)}. A positive difference means Razorpay recorded
        more than the platform ledger (money received the platform hasn&apos;t recorded). Open the Payments tab to see
        exactly which transactions differ.
      </p>
    </div>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "border-t border-border pt-2" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`${strong ? "font-semibold" : "font-medium"} ${danger ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

function PaymentsTab({ range }: { range: { from: string; to: string } }) {
  const { data, loading, error } = useReconData<ReconPayments>(
    () => getReconPayments(range),
    [range.from, range.to]
  );
  const [onlyIssues, setOnlyIssues] = useState(false);

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorNotice message={error} />;
  if (!data) return null;

  const rows = onlyIssues
    ? data.rows.filter((r) => r.status !== "MATCHED" && r.status !== "RAZORPAY_UNCAPTURED")
    : data.rows;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Matched" value={String(data.counts.matched)} tone="ok" />
        <Tile label="Not in platform" value={String(data.counts.missingInPlatform)} tone={data.counts.missingInPlatform ? "danger" : undefined} hint="Money received, not recorded" />
        <Tile label="Not in Razorpay" value={String(data.counts.missingInRazorpay)} hint="Platform PAID, no capture" />
        <Tile label="Amount mismatch" value={String(data.counts.amountMismatch)} tone={data.counts.amountMismatch ? "danger" : undefined} />
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="h-4 w-4 rounded border-input" />
        Show only mismatches
      </label>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {onlyIssues ? "No mismatches in this window 🎉" : "No payments in this window."}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Razorpay</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2">Event / Session</th>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_BADGE[r.status];
                return (
                  <tr key={r.paymentId} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Badge variant={s.variant}>{s.label}</Badge>
                      {r.amountMismatch && <Badge variant="destructive" className="ml-1">₹ mismatch</Badge>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.paymentId}</td>
                    <td className="px-3 py-2">
                      {r.razorpayAmount === null ? "—" : money(r.razorpayAmount)}
                      {r.razorpayStatus && <span className="ml-1 text-xs text-muted-foreground">({r.razorpayStatus})</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.platform ? (
                        <>
                          {money(r.platform.amount)}
                          <span className="ml-1 text-xs text-muted-foreground">({r.platform.paymentStatus})</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">{r.platform?.title ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <PaymentAction row={r} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Deep link from a payment row to the transactions detail page. A captured
 * payment the platform never recorded (MISSING_IN_PLATFORM) links straight to
 * the reconcile action with the pay_… id pre-filled; anything already tied to a
 * platform event registration links to view it. Sessions / unresolved rows have
 * no target.
 */
function PaymentAction({ row }: { row: ReconPaymentRow }) {
  const regId = row.reconcileRegistrationId;
  if (!regId) return <span className="text-xs text-muted-foreground">—</span>;

  if (row.status === "MISSING_IN_PLATFORM") {
    return (
      <Link
        href={`/dashboard/transactions/${regId}?pay=${encodeURIComponent(row.paymentId)}`}
        className="text-xs font-medium text-primary hover:underline"
      >
        Reconcile →
      </Link>
    );
  }
  return (
    <Link href={`/dashboard/transactions/${regId}`} className="text-xs font-medium text-primary hover:underline">
      View
    </Link>
  );
}

function SettlementsTab({ range }: { range: { from: string; to: string } }) {
  const { data, loading, error } = useReconData<ReconSettlements>(
    () => getReconSettlements(range),
    [range.from, range.to]
  );

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorNotice message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Total settled to bank" value={money(data.totalSettled)} tone="ok" />
        <Tile label="Settlements" value={String(data.count)} />
      </div>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No settlements in this window. Razorpay settles captured payments to your bank on its own cycle (usually T+2).
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Settled</th>
                <th className="px-3 py-2">Amount to bank</th>
                <th className="px-3 py-2">Fees</th>
                <th className="px-3 py-2">GST</th>
                <th className="px-3 py-2">UTR</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-2">{fmtDate(s.settledAt)}</td>
                  <td className="px-3 py-2 font-semibold text-foreground">{money(s.amount)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{money(s.fees)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{money(s.tax)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{s.utr ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status === "processed" ? "success" : "neutral"}>{s.status ?? "—"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RefundsTab({ range }: { range: { from: string; to: string } }) {
  const { data, loading, error } = useReconData<ReconRefunds>(
    () => getReconRefunds(range),
    [range.from, range.to]
  );

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorNotice message={error} />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Razorpay refunds" value={String(data.counts.total)} />
        <Tile label="Matched" value={String(data.counts.matched)} tone="ok" />
        <Tile label="Not in platform" value={String(data.counts.missingInPlatform)} tone={data.counts.missingInPlatform ? "danger" : undefined} />
      </div>

      {data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No refunds in this window.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Refund</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.refundId} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Badge variant={r.status === "MATCHED" ? "success" : "destructive"}>
                      {r.status === "MATCHED" ? "Matched" : "Not in platform"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.refundId}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{money(r.razorpayAmount)}</td>
                  <td className="px-3 py-2">{r.platform?.title ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PayoutsTab() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getAllPayoutsUnpaginated().then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) setError(error.message);
      else setPayouts(data ?? []);
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (error) return <ErrorNotice message={error} />;

  const totalPaid = payouts
    .filter((p) => p.status === "COMPLETED")
    .reduce((s, p) => s + Number(p.netAmount), 0);
  const pending = payouts.filter((p) => p.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Paid out to organisers" value={money(totalPaid)} />
        <Tile label="Payouts" value={String(payouts.length)} />
        <Tile label="Pending" value={String(pending)} tone={pending ? "danger" : undefined} />
      </div>
      <p className="text-xs text-muted-foreground">
        Payouts are created manually (organiser request or admin) and settled by hand — there is no automated transfer.
        Full controls live under Finance → Payouts.
      </p>

      {payouts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No payouts yet.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Curator</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">UTR</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2">{p.event?.title ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{p.user?.fullName ?? p.user?.username ?? "—"}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{money(p.netAmount)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={p.status === "COMPLETED" ? "success" : p.status === "PENDING" ? "warning" : "neutral"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.utr ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
