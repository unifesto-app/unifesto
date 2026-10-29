"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Bank, Plus, Trash, CheckCircle, XCircle, Clock } from "@unifesto/unicon/react";
import {
  getMyBankAccounts,
  addBankAccount,
  deleteBankAccount,
  setPrimaryBankAccount,
  IFSC_RE,
  ACCOUNT_NUMBER_RE,
  UPI_RE,
  type BankAccount,
  type BankAccountStatus,
  type AddBankAccountPayload,
} from "@/console/lib/api/payouts-api";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

const STATUS: Record<
  BankAccountStatus,
  { label: string; variant: "success" | "warning" | "destructive"; Icon: typeof Clock }
> = {
  VERIFIED: { label: "Verified", variant: "success", Icon: CheckCircle },
  PENDING: { label: "Pending review", variant: "warning", Icon: Clock },
  REJECTED: { label: "Rejected", variant: "destructive", Icon: XCircle },
};

const EMPTY: AddBankAccountPayload = {
  methodType: "BANK",
  accountHolderName: "",
  mobileNumber: "",
  accountNumber: "",
  ifscCode: "",
  bankName: "",
  accountType: "savings",
  upiId: "",
  isPrimary: false,
};

export function BankAccountsPanel() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AddBankAccountPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getMyBankAccounts();
    if (error) setError(error.message);
    else setAccounts(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isUpi = form.methodType === "UPI";

  async function save() {
    const accountNumber = (form.accountNumber ?? "").replace(/\s+/g, "");
    const ifscCode = (form.ifscCode ?? "").trim().toUpperCase();
    const upiId = (form.upiId ?? "").trim();
    const problem =
      !form.accountHolderName.trim() || !form.mobileNumber.trim()
        ? "Name and linked mobile number are required."
        : isUpi
          ? !UPI_RE.test(upiId) && "Enter a valid UPI ID, like name@okhdfc."
          : !ACCOUNT_NUMBER_RE.test(accountNumber)
            ? "Account number must be 9 to 18 digits."
            : !IFSC_RE.test(ifscCode)
              ? "Enter a valid IFSC code, like HDFC0001234."
              : !form.bankName?.trim() && "Bank name is required.";
    if (problem) {
      setFormError(problem);
      return;
    }
    setSaving(true);
    setFormError("");
    const { error } = await addBankAccount({
      methodType: form.methodType,
      accountHolderName: form.accountHolderName.trim(),
      mobileNumber: form.mobileNumber.trim(),
      isPrimary: form.isPrimary,
      ...(isUpi
        ? { upiId }
        : { accountNumber, ifscCode, bankName: form.bankName?.trim(), accountType: form.accountType }),
    });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setForm(EMPTY);
    setAdding(false);
    void load();
  }

  async function makePrimary(id: string) {
    setBusy(id);
    const { error } = await setPrimaryBankAccount(id);
    setBusy(null);
    if (error) setError(error.message);
    else void load();
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this bank account?")) return;
    const { error } = await deleteBankAccount(id);
    if (error) setError(error.message);
    else void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Bank accounts and UPI IDs where your event earnings are transferred. An admin
          verifies each before payouts can be released. You can keep several and
          route an event to another space admin&apos;s method.
        </p>
        {!adding && (
          <Button
            className="flex-shrink-0"
            onClick={() => { setForm(EMPTY); setFormError(""); setAdding(true); }}
          >
            <Plus className="mr-1.5 h-4 w-4" weight="bold" />
            Add method
          </Button>
        )}
      </div>

      {error && <ErrorNotice message={error} />}

      {adding && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Add a payout method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="flex gap-2" role="radiogroup" aria-label="Payout method type">
              {(["BANK", "UPI"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={form.methodType === m}
                  onClick={() => { setForm((f) => ({ ...f, methodType: m })); setFormError(""); }}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${form.methodType === m ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  {m === "BANK" ? "Bank account" : "UPI"}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={isUpi ? "Payee name" : "Account holder name"}
                value={form.accountHolderName}
                onChange={(v) => setForm((f) => ({ ...f, accountHolderName: v }))}
                placeholder={isUpi ? "Name on the UPI ID" : "As per bank records"}
              />
              <Field
                label="Linked mobile number"
                value={form.mobileNumber}
                onChange={(v) => setForm((f) => ({ ...f, mobileNumber: v }))}
                placeholder="10-digit mobile linked to the account"
              />

              {isUpi ? (
                <Field label="UPI ID" value={form.upiId ?? ""} onChange={(v) => setForm((f) => ({ ...f, upiId: v }))} placeholder="e.g. name@okhdfc" />
              ) : (
              <>
              <Field label="Bank name" value={form.bankName ?? ""} onChange={(v) => setForm((f) => ({ ...f, bankName: v }))} placeholder="e.g. HDFC Bank" />
              <Field label="Account number" value={form.accountNumber ?? ""} onChange={(v) => setForm((f) => ({ ...f, accountNumber: v.replace(/[^\d\s]/g, "") }))} placeholder="9 to 18 digits" inputMode="numeric" />
              <Field label="IFSC code" value={form.ifscCode ?? ""} onChange={(v) => setForm((f) => ({ ...f, ifscCode: v.toUpperCase() }))} placeholder="e.g. HDFC0001234" />
              <div className="space-y-1.5">
                <Label htmlFor="acctType">Account type</Label>
                <select
                  id="acctType"
                  value={form.accountType}
                  onChange={(e) => setForm((f) => ({ ...f, accountType: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
                >
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                </select>
              </div>
              </>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={!!form.isPrimary}
                onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Make this my primary payout method
            </label>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdding(false)} disabled={saving}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save account"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      ) : accounts.length === 0 && !adding ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Bank}
              tone="positive"
              title="No payout method yet"
              description="Add a bank account or UPI ID so we can release your event earnings."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus className="mr-1.5 h-4 w-4" weight="bold" />Add method
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => {
            const s = STATUS[a.status];
            return (
              <Card key={a.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {a.methodType === "UPI" ? "UPI" : a.bankName}
                      </p>
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
                        : ` · ****${(a.accountNumber ?? "").slice(-4)} · ${a.ifscCode ?? ""}`}
                      {a.mobileNumber ? ` · ${a.mobileNumber}` : ""}
                    </p>
                    {a.status !== "VERIFIED" && a.rejectionReason && (
                      <p className="mt-1 text-xs text-destructive">
                        {a.status === "REJECTED" ? "Reason" : "Verification revoked"}: {a.rejectionReason}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {!a.isPrimary && a.status !== "REJECTED" && (
                      <Button variant="outline" size="sm" disabled={busy === a.id} onClick={() => makePrimary(a.id)}>
                        {busy === a.id ? "Saving…" : "Make primary"}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)} aria-label="Remove account">
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: "numeric" }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} />
    </div>
  );
}
