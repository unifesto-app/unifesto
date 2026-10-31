"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass, Plus } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORY,
  CompanyItemDialog,
  ItemRow,
  STATUS,
  isOpen,
  personName,
  useCompany,
} from "@/components/company/company-ui";
import { COMPANY_CATEGORIES, COMPANY_STATUSES, type CompanyItem } from "@/lib/api/company-api";

const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground";

const monthOf = (i: CompanyItem) =>
  i.dueDate
    ? new Date(i.dueDate).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })
    : "No due date";

/** Every obligation by due month (U6), filtered by category, status and owner. */
export default function ObligationsPage() {
  const { items, people, error, reload, meId, canManage } = useCompany();
  // "new" opens the create form; a number opens that item.
  const [open, setOpen] = useState<number | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [owner, setOwner] = useState("");

  // The API sorts by due date (undated last), so month groups come out in order.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ownerId = owner === "me" ? meId : owner;
    const out = new Map<string, CompanyItem[]>();
    for (const i of items ?? []) {
      if (category && i.category !== category) continue;
      if (status === "OPEN" ? !isOpen(i) : status && i.status !== status) continue;
      if (owner === "none" ? i.ownerId : ownerId && i.ownerId !== ownerId) continue;
      if (q && !`c${i.number} ${i.title} ${i.reference ?? ""} ${i.notes ?? ""}`.toLowerCase().includes(q)) continue;
      const m = monthOf(i);
      out.set(m, [...(out.get(m) ?? []), i]);
    }
    return [...out];
  }, [items, query, category, status, owner, meId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Obligations"
        subtitle="Filings, renewals and registers, by due month."
        actions={
          canManage && (
            <Button onClick={() => setOpen("new")}>
              <Plus className="h-4 w-4" /> Obligation
            </Button>
          )
        }
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by C number, title, reference…"
            className="pl-9"
          />
        </div>
        <select aria-label="Category" className={selectCls} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {COMPANY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY[c]}
            </option>
          ))}
        </select>
        <select aria-label="Status" className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OPEN">Open</option>
          <option value="">Any status</option>
          {COMPANY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS[s].label}
            </option>
          ))}
        </select>
        <select aria-label="Owner" className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {personName(p) ?? p.id}
            </option>
          ))}
        </select>
      </div>

      {items === null && !error ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : !groups.length ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {items?.length ? "Nothing matches these filters." : "No obligations yet."}
        </p>
      ) : (
        groups.map(([month, list]) => (
          <section key={month} className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">
              {month} <span className="font-mono text-xs text-muted-foreground">{list.length}</span>
            </h2>
            <div className="divide-y divide-border rounded-xl border border-border">
              {list.map((i) => (
                <ItemRow key={i.id} item={i} onOpen={() => setOpen(i.number)} />
              ))}
            </div>
          </section>
        ))
      )}

      {open !== null && (
        <CompanyItemDialog
          number={open === "new" ? null : open}
          people={people}
          canManage={canManage}
          meId={meId}
          onClose={() => setOpen(null)}
          onSaved={() => void reload()}
        />
      )}
    </div>
  );
}
