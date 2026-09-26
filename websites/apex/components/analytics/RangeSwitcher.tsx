"use client";

import type { AnalyticsRange } from "@/lib/api/analytics-api";
import { cn } from "@/lib/utils/cn";

/**
 * The range options every analytics chart offers. Granularity follows the
 * range on the backend: `today` → hourly, `7d`/`1m` → daily, the rest monthly.
 * Shared so the Financial and Growth switchers can never drift apart.
 */
export const ANALYTICS_RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "1m", label: "1M" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
  { value: "24m", label: "24M" },
];

/** Segmented control for the analytics time range. */
export function RangeSwitcher({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-0.5">
      {ANALYTICS_RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            value === r.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
