"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDots, Clock, UserCircle, WarningCircle } from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CompanyItemDialog, ItemRow, daysUntil, isOpen, isOverdue, useCompany } from "@/components/company/company-ui";
import type { CompanyItem } from "@/lib/api/company-api";

/** Company Overview (U6): what is late, what is coming, and what is mine. */
export default function CompanyOverviewPage() {
  const { items, people, error, reload, meId, canManage } = useCompany();
  const [open, setOpen] = useState<number | null>(null);

  const v = useMemo(() => {
    const live = (items ?? []).filter(isOpen);
    const within = (n: number) => live.filter((i) => i.dueDate && daysUntil(i.dueDate) >= 0 && daysUntil(i.dueDate) <= n);
    return {
      overdue: live.filter(isOverdue),
      due30: within(30),
      due90: within(90),
      mine: live.filter((i) => i.ownerId === meId),
    };
  }, [items, meId]);

  const loading = items === null && !error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company"
        subtitle="Filings and deadlines for the company. Overdue first."
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/company/obligations">All obligations</Link>
          </Button>
        }
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Overdue" value={v.overdue.length} icon={WarningCircle} loading={loading} />
        <StatCard title="Due in 30 days" value={v.due30.length} icon={Clock} loading={loading} />
        <StatCard title="Due in 90 days" value={v.due90.length} icon={CalendarDots} loading={loading} />
        <StatCard title="My open items" value={v.mine.length} icon={UserCircle} loading={loading} />
      </div>

      <Section
        title="Needs attention"
        empty="Nothing overdue or due in the next 30 days."
        items={loading ? null : [...v.overdue, ...v.due30]}
        onOpen={setOpen}
      />
      <Section title="My items" empty="No open items assigned to me." items={loading ? null : v.mine} onOpen={setOpen} />

      {open !== null && (
        <CompanyItemDialog
          number={open}
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

function Section({
  title,
  empty,
  items,
  onOpen,
}: {
  title: string;
  empty: string;
  /** null while loading. */
  items: CompanyItem[] | null;
  onOpen: (number: number) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-foreground">{title}</h2>
      {!items ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : items.length ? (
        <div className="divide-y divide-border rounded-xl border border-border">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} onOpen={() => onOpen(i.number)} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
