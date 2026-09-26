"use client";

import { useCallback, useEffect, useState } from "react";
import { Bank, CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import {
  getAllBankAccounts,
  updateBankAccountStatus,
  type BankAccount,
  type BankAccountStatus,
} from "@/lib/api/payouts-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS: Record<
  BankAccountStatus,
  { label: string; variant: "success" | "warning" | "destructive"; Icon: typeof Clock }
> = {
  VERIFIED: { label: "Verified", variant: "success", Icon: CheckCircle },
  PENDING: { label: "Pending", variant: "warning", Icon: Clock },
  REJECTED: { label: "Rejected", variant: "destructive", Icon: XCircle },
};

const PAGE_SIZE = 20;

export default function AdminBankAccountsPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [status, setStatus] = useState<BankAccountStatus | "all">("PENDING");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAllBankAccounts({
      page,
      limit: PAGE_SIZE,
      status: status === "all" ? undefined : status,
    });
    if (error) setError(error.message);
    else if (data) {
      setAccounts(data.accounts);
      setTotalPages(data.pagination.totalPages || 1);
    }
    setLoading(false);
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  async function decide(a: BankAccount, action: "VERIFIED" | "REJECTED") {
    let rejectionReason: string | undefined;
    if (action === "REJECTED") {
      const reason = window.prompt("Reason for rejecting this account (shown to the organiser):");
      if (reason === null) return; // cancelled
      rejectionReason = reason.trim() || "Details could not be verified.";
    } else if (!window.confirm(`Verify ${a.methodType === "UPI" ? `UPI ${a.upiId ?? ""}` : a.bankName} (${a.accountHolderName})? Payouts can then be released to it.`)) {
      return;
    }
    setBusy(a.id);
    const { error } = await updateBankAccountStatus(a.id, { status: action, rejectionReason });
    setBusy(null);
    if (error) setError(error.message);
    else void load();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank accounts"
        subtitle="Verify organiser payout accounts. A verified primary account is required before payouts queue for an event."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select value={status} onValueChange={(v) => setStatus(v as BankAccountStatus | "all")}>
          <SelectTrigger className="w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending review</SelectItem>
            <SelectItem value="VERIFIED">Verified</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-secondary">
              <Bank className="h-6 w-6 text-secondary-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No bank accounts {status !== "all" ? `with status ${status.toLowerCase()}` : "yet"}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => {
            const s = STATUS[a.status];
            const organiser = a.user?.fullName || a.user?.username || "Organiser";
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {a.methodType === "UPI" ? "UPI" : a.bankName}
                      </p>
                      <Badge variant="neutral">{a.methodType === "UPI" ? "UPI" : "Bank"}</Badge>
                      {a.isPrimary && <Badge variant="brand">Primary</Badge>}
                      <Badge variant={s.variant}>
                        <s.Icon className="mr-1 h-3.5 w-3.5" />
                        {s.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.accountHolderName}
                      {a.methodType === "UPI"
                        ? a.upiId ? ` · ${a.upiId}` : ""
                        : ` · ${a.accountNumber ?? ""} · ${a.ifscCode ?? ""} · ${a.accountType}`}
                      {a.mobileNumber ? ` · 📱 ${a.mobileNumber}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Organiser: <span className="text-foreground">{organiser}</span>
                      {a.user?.mobileNumber ? ` · ${a.user.mobileNumber}` : ""}
                    </p>
                    {a.status === "REJECTED" && a.rejectionReason && (
                      <p className="mt-1 text-xs text-[hsl(358_65%_44%)]">Reason: {a.rejectionReason}</p>
                    )}
                  </div>
                  {a.status === "PENDING" && (
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => decide(a, "REJECTED")}>
                        Reject
                      </Button>
                      <Button size="sm" disabled={busy === a.id} onClick={() => decide(a, "VERIFIED")}>
                        {busy === a.id ? "…" : "Verify"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
