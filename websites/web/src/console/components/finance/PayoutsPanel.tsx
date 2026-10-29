"use client";

import { inr } from "@/console/lib/utils/money";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";

import { Money, ArrowRight, CheckCircle, Clock } from "@unifesto/unicon/react";
import {
  getSpacePayouts,
  getPayoutSummary,
  getEventEligibleAccounts,
  requestPayout,
  type Payout,
  type PayoutStatus,
  type PayoutTarget,
  type EventPayoutSummary,
  type EligibleAccount,
} from "@/console/lib/api/payouts-api";
import { getSpaceEvents, type Event } from "@/console/lib/api/events-api";
import { listSpaceSessions, type Session } from "@/console/lib/api/sessions-api";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Input } from "@/console/components/ui/input";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";
import { matches, Pager, SearchBox, usePaged } from "@/console/components/shared/ListControls";

const money = (v: number | string) => inr(v);

/** Short label for an eligible payout account (bank ****last4 or UPI id). */
const accountLabel = (a: EligibleAccount) =>
  a.methodType === "UPI"
    ? `${a.accountHolderName} · UPI ${a.upiId ?? ""}`
    : `${a.accountHolderName} · ${a.bankName ?? "Bank"} ****${a.accountNumberLast4 ?? ""}`;
const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

const STATUS: Record<PayoutStatus, { label: string; variant: "warning" | "neutral" | "success" | "destructive" }> = {
  PENDING: { label: "Queued", variant: "warning" },
  PROCESSING: { label: "Processing", variant: "neutral" },
  COMPLETED: { label: "Paid", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

export function PayoutsPanel() {
  const spaceId = useSpaceId();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestTarget, setRequestTarget] = useState<PayoutTarget | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [pRes, eRes, sRes] = await Promise.all([
      getSpacePayouts(spaceId),
      getSpaceEvents(spaceId, { limit: 100 }),
      listSpaceSessions(spaceId),
    ]);
    if (pRes.error) setError(pRes.error.message);
    else setPayouts(pRes.data ?? []);
    if (eRes.data) setEvents(eRes.data.events);
    if (sRes.data) setSessions(sRes.data);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Payouts already come space-scoped from the backend (every event in the
  // space, not just the caller's own), so no client-side filtering is needed.
  const spacePayouts = payouts;
  const shown = spacePayouts.filter((p) =>
    matches(search, p.event?.title ?? p.session?.title, p.utr, STATUS[p.status].label)
  );
  const { page, setPage, totalPages, pageItems } = usePaged(shown);
  const now = Date.now();
  // Any revenue-earning event can be drawn down — it need not have ended, so a
  // live event with sales is requestable. We surface events with paid tickets
  // (derived from ticket prices, since `isFree` is unreliable) that aren't
  // drafts/cancelled; the dialog shows the remaining balance and the backend
  // blocks a request with nothing left to draw.
  const isPaidEvent = (e: Event) =>
    (e.ticketTypes ?? []).some((t) => Number(t.price) > 0);
  const requestable = events.filter(
    (e) => isPaidEvent(e) && e.status !== "DRAFT" && e.status !== "CANCELLED"
  );
  // Paid Huddle sessions pay out the same way (T6).
  const requestableSessions = sessions.filter(
    (x) => Number(x.price) > 0 && x.status !== "DRAFT" && x.status !== "CANCELLED"
  );

  return (
    <div className="space-y-6">
      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : (
        <>
          {/* Request a payout */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Request a payout</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {requestable.length === 0 && requestableSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events or sessions are ready for a payout yet. One becomes eligible once it has earned revenue (paid tickets sold) — it doesn&apos;t have to have ended. Make sure your bank account is verified under <span className="font-medium">Accounts</span>.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {requestable.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{e.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(e.endDateTime).getTime() < now ? "Ended" : "Ends"} {fmt(e.endDateTime)}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setRequestTarget({ kind: "event", id: e.id, title: e.title })}>
                        <ArrowRight className="mr-1 h-4 w-4" />Request payout
                      </Button>
                    </div>
                  ))}
                  {requestableSessions.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{x.title}</p>
                        <p className="text-xs text-muted-foreground">Huddle session · {fmt(x.startDateTime)}</p>
                      </div>
                      <Button size="sm" onClick={() => setRequestTarget({ kind: "session", id: x.id, title: x.title })}>
                        <ArrowRight className="mr-1 h-4 w-4" />Request payout
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payout history */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payouts ({spacePayouts.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {spacePayouts.length === 0 ? (
                <EmptyState
                  icon={Money}
                  title="No payouts yet"
                  description="Once you request a payout for an event, it appears here with its status and transfer details."
                />
              ) : (
                <>
                <div className="px-4 pb-2">
                  <SearchBox
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(1);
                    }}
                    placeholder="Search event, UTR or status"
                  />
                </div>
                {shown.length === 0 && (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">No payouts match “{search}”.</p>
                )}
                <div className="divide-y divide-border">
                  {pageItems.map((p) => {
                    const s = STATUS[p.status];
                    return (
                      <div key={p.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-foreground">{p.event?.title ?? p.session?.title ?? "Event"}</p>
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {p.status === "COMPLETED"
                              ? <><CheckCircle className="mr-1 inline h-3.5 w-3.5 text-success" />Paid {fmt(p.completedAt)}{p.utr ? ` · UTR ${p.utr}` : ""}</>
                              : <><Clock className="mr-1 inline h-3.5 w-3.5" />Scheduled {fmt(p.scheduledAt)}</>}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-foreground">{money(p.netAmount)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="px-4 pb-4">
                  <Pager page={page} totalPages={totalPages} onPage={setPage} />
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <RequestPayoutDialog
        target={requestTarget}
        onClose={() => setRequestTarget(null)}
        onDone={() => {
          setRequestTarget(null);
          void load();
        }}
      />
    </div>
  );
}

/**
 * Request a payout for one event — full remaining balance or a custom net
 * amount. Also opened from the event's Transactions page (mobile parity).
 */
export function RequestPayoutDialog({
  target,
  onClose,
  onDone,
}: {
  target: PayoutTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState<EventPayoutSummary | null>(null);
  const [accounts, setAccounts] = useState<EligibleAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!target) return;
    setSummary(null);
    setAccounts([]);
    setAccountId("");
    setMode("full");
    setAmount("");
    setErr("");
    setLoading(true);
    void Promise.all([
      getPayoutSummary(target),
      getEventEligibleAccounts(target.id, target.kind),
    ]).then(([sRes, aRes]) => {
      setLoading(false);
      if (sRes.error) setErr(sRes.error.message);
      else setSummary(sRes.data);
      if (aRes.data) {
        setAccounts(aRes.data.accounts);
        // Default to the event's persisted account, else its primary, else the
        // first eligible one.
        const preset = aRes.data.selectedBankAccountId;
        const fallback =
          aRes.data.accounts.find((a) => a.isOwn && a.isPrimary) ??
          aRes.data.accounts[0];
        setAccountId(
          (preset && aRes.data.accounts.some((a) => a.id === preset)
            ? preset
            : fallback?.id) ?? ""
        );
      }
    });
  }, [target]);

  if (!target) return null;

  const available = summary?.available ?? 0;
  const customAmt = Number(amount);
  const customInvalid =
    mode === "custom" && (!amount || customAmt <= 0 || customAmt > available);

  async function submit() {
    if (!target) return;
    setSubmitting(true);
    setErr("");
    const custom = mode === "custom" ? customAmt : undefined;
    // Pass the chosen account only when it differs from the creator's own
    // primary — otherwise let the backend resolve the default.
    const { error } = await requestPayout(target, custom, accountId || undefined);
    setSubmitting(false);
    if (error) setErr(error.message);
    else onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request payout</DialogTitle>
          <DialogDescription>{target.title}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading balance…</p>
        ) : summary ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{target.kind === "session" ? "Session net" : "Event net"}</span>
                <span className="font-medium">{money(summary.eventNet)}</span>
              </div>
              {summary.committed > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already paid / pending</span>
                  <span className="font-medium">−{money(summary.committed)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-border pt-1">
                <span className="text-muted-foreground">Available</span>
                <span className="font-semibold">{money(summary.available)}</span>
              </div>
              {(summary.overdrawn ?? 0) > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>Overdrawn (refunds after payout)</span>
                  <span className="font-semibold">−{money(summary.overdrawn ?? 0)}</span>
                </div>
              )}
            </div>

            {available <= 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing left to pay out for this {target.kind}.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Destination — own or another space admin's verified method. */}
                {accounts.length > 0 && (
                  <div className="space-y-1">
                    <label htmlFor="payout-account" className="text-xs font-medium text-muted-foreground">
                      Pay to
                    </label>
                    <select
                      id="payout-account"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {accountLabel(a)}
                          {a.isOwn ? "" : ` — ${a.ownerName} (space admin)`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-2">
                  {(["full", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                        mode === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {m === "full" ? "Full balance" : "Custom amount"}
                    </button>
                  ))}
                </div>
                {mode === "custom" && (
                  <div className="space-y-1">
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={`Up to ${money(available)}`}
                    />
                    {customInvalid && amount !== "" && (
                      <p className="text-xs text-destructive">
                        Enter an amount between ₹1 and {money(available)}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}

        {err && <p className="text-sm text-destructive">{err}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || loading || available <= 0 || customInvalid}
          >
            {submitting ? "Requesting…" : "Request payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
