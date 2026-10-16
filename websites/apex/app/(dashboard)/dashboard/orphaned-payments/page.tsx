"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getOrphanedPayments,
  type OrphanedPayments,
  type OrphanedPaymentRow,
} from "@/lib/api/reconciliation-api";
import { reconcileTransaction } from "@/lib/api/admin-transactions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

const money = (v: number) => `₹${Number(v).toLocaleString("en-IN")}`;
const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** YYYY-MM-DD, N days back from today — for the <input type=date> window. */
function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Per-row action state, keyed by payment id. */
type RowState = {
  busy?: boolean;
  ok?: string;
  err?: string;
  /** Manually-entered target registration id, when none was auto-resolved. */
  manualTarget?: string;
  /**
   * Set when the last attempt was refused because the captured amount differs
   * from the target registration's price. Surfaces an explicit "Attach anyway"
   * override so the admin must consciously re-home a mismatched payment.
   */
  mismatch?: boolean;
};

export default function OrphanedPaymentsPage() {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [range, setRange] = useState({ from: isoDaysAgo(30), to: isoDaysAgo(0) });

  const [data, setData] = useState<OrphanedPayments | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await getOrphanedPayments(range);
    if (error) setError(error.message);
    else setData(data);
    setLoading(false);
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (paymentId: string, patch: RowState) =>
    setRowState((s) => ({ ...s, [paymentId]: { ...s[paymentId], ...patch } }));

  const attach = useCallback(
    async (row: OrphanedPaymentRow, allowAmountMismatch = false) => {
      const target = row.targetRegistrationId ?? rowState[row.paymentId]?.manualTarget?.trim();
      if (!target) {
        patchRow(row.paymentId, { err: "Enter a registration id to attach this payment to." });
        return;
      }
      const warning = allowAmountMismatch ? " The amount does not match this registration." : "";
      if (!window.confirm(`Attach payment ${row.paymentId} to registration ${target}?${warning} This can't be undone.`)) return;
      patchRow(row.paymentId, { busy: true, ok: undefined, err: undefined });
      const { data, error } = await reconcileTransaction(
        target,
        row.paymentId,
        row.reassignOrphan,
        allowAmountMismatch
      );
      if (error) {
        // A price/fee difference is recoverable via the explicit override, so
        // flag it to reveal the "Attach anyway" button rather than dead-ending.
        const mismatch = /does not match this registration/i.test(error.message);
        patchRow(row.paymentId, { busy: false, err: error.message, mismatch });
        return;
      }
      patchRow(row.paymentId, {
        busy: false,
        mismatch: false,
        ok: data?.detail ?? `Attached — ${data?.newStatus ?? "settled"}.`,
      });
      // Refresh so a now-settled payment drops off the list.
      setTimeout(() => void load(), 1200);
    },
    [rowState, load]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orphaned Payments"
        subtitle="Captured Razorpay payments whose money never became a paid ticket — because the registration they were made against was deleted (orphaned) or its webhook was missed (unsettled). Attach each one to the right registration in a click."
      />

      {/* Date window. */}
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
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {/* Counts. */}
      {data && !loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Needs attention" value={String(data.counts.total)} />
          <Tile label="Orphaned" value={String(data.counts.orphaned)} tone={data.counts.orphaned ? "danger" : undefined} />
          <Tile label="Unsettled" value={String(data.counts.unsettled)} tone={data.counts.unsettled ? "warn" : undefined} />
          <Tile label="No target found" value={String(data.counts.unresolved)} tone={data.counts.unresolved ? "warn" : undefined} />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data && data.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No orphaned or unsettled captured payments in this window. Every captured payment is
              reflected as a paid ticket.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.rows.map((row) => (
            <OrphanRow
              key={row.paymentId}
              row={row}
              state={rowState[row.paymentId] ?? {}}
              onManualChange={(v) =>
                patchRow(row.paymentId, { manualTarget: v, err: undefined, mismatch: false })
              }
              onAttach={() => void attach(row)}
              onAttachAnyway={() => void attach(row, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "warn";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold ${
          tone === "danger"
            ? "text-destructive"
            : tone === "warn"
              ? "text-warning"
              : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OrphanRow({
  row,
  state,
  onManualChange,
  onAttach,
  onAttachAnyway,
}: {
  row: OrphanedPaymentRow;
  state: RowState;
  onManualChange: (v: string) => void;
  onAttach: () => void;
  onAttachAnyway: () => void;
}) {
  const isOrphan = row.classification === "ORPHANED";
  const hasTarget = !!row.targetRegistrationId;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={isOrphan ? "destructive" : "warning"}>
                {isOrphan ? "Orphaned" : "Unsettled"}
              </Badge>
              <span className="font-mono text-sm text-foreground">{row.paymentId}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {row.contact || row.email || "—"} · {fmtDateTime(row.createdAt)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-foreground">{money(row.amount)}</p>
            <p className="text-xs capitalize text-muted-foreground">{row.method || row.status}</p>
          </div>
        </div>

        {/* Why it's here + what the button will do. */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          {isOrphan ? (
            <>
              Its original registration (
              <span className="font-mono">{row.notesRegistrationId ?? "unknown"}</span>) no longer
              exists, so this payment is orphaned.{" "}
              {row.suggestion ? (
                <>
                  Attaching will re-home it onto{" "}
                  <Link
                    href={`/dashboard/transactions/${row.suggestion.registrationId}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {row.suggestion.attendee}&apos;s pending ticket
                  </Link>{" "}
                  for <span className="font-medium">{row.suggestion.eventTitle}</span> and mark it
                  paid.
                </>
              ) : (
                <>
                  No matching pending registration was found — enter the target
                  registration id below. This can be a pending{" "}
                  <span className="font-medium">or a failed</span> registration
                  (e.g. the attendee&apos;s own payment failed but this captured
                  payment is still owed to them).
                </>
              )}
            </>
          ) : (
            <>
              A payment was captured but the ticket stayed pending (a missed webhook). Attaching
              will settle{" "}
              <Link
                href={`/dashboard/transactions/${row.targetRegistrationId}`}
                className="font-medium text-primary hover:underline"
              >
                the registration
              </Link>{" "}
              in place.
            </>
          )}
        </div>

        {/* Manual target entry when nothing was auto-resolved. */}
        {!hasTarget && (
          <Input
            placeholder="Target registration id (uuid)"
            value={state.manualTarget ?? ""}
            onChange={(e) => onManualChange(e.target.value)}
            className="font-mono text-xs"
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onAttach} disabled={state.busy}>
            {state.busy ? "Attaching…" : hasTarget ? "Attach & mark paid" : "Attach to entered id"}
          </Button>
          {/* Only after an amount-mismatch refusal: a deliberate override that
              re-homes the payment despite the price difference and rewrites the
              registration's recorded amount to the captured value. */}
          {state.mismatch && (
            <Button
              variant="destructive"
              onClick={onAttachAnyway}
              disabled={state.busy}
              title="Attaches the payment and updates the registration's amount to the captured value."
            >
              {state.busy ? "Attaching…" : `Attach anyway — record ${money(row.amount)}`}
            </Button>
          )}
          {state.ok && <span className="text-xs font-medium text-success">{state.ok}</span>}
          {state.err && <span className="text-xs font-medium text-destructive">{state.err}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
