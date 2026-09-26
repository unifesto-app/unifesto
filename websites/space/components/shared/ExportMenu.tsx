"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  CaretDown,
  LockSimple,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ExportFormat } from "@/lib/api/registrations-api";

const FORMATS: [ExportFormat, string][] = [
  ["csv", "CSV (.csv)"],
  ["xlsx", "Excel (.xls)"],
  ["pdf", "PDF (.pdf)"],
];

interface ExportMenuProps {
  /** Fired with the chosen format when export is allowed. */
  onExport: (format: ExportFormat) => void;
  /** True while a download is in flight — disables the trigger. */
  exporting: boolean;
  /**
   * Disable for reasons unrelated to the plan (still loading, no rows to
   * export). Distinct from `canExport` so we lock-vs-disable correctly.
   */
  disabled?: boolean;
  /**
   * Whether this space's plan includes bulk export. `undefined` means the plan
   * is still loading — we keep the button live (the backend still enforces the
   * gate) rather than flashing a lock. `false` swaps the format list for an
   * upgrade prompt so the click can't fail with a raw error.
   */
  canExport?: boolean;
}

/**
 * Export dropdown shared by the attendees and transactions pages. Owns its own
 * open/close + outside-click handling. When the space's plan lacks bulk export
 * (`canExport === false`) the menu becomes an upsell instead of firing a
 * request that the backend would reject with a 400.
 */
export function ExportMenu({
  onExport,
  exporting,
  disabled = false,
  canExport,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const locked = canExport === false;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        disabled={exporting || disabled}
      >
        {locked ? (
          <LockSimple className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {exporting ? "Exporting..." : "Export"}
        <CaretDown className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {locked ? (
            <div className="p-3">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <LockSimple className="h-4 w-4 text-muted-foreground" />
                Bulk export is a Growth feature
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Upgrade this space to download attendees and transactions as
                CSV, Excel or PDF.
              </p>
              <Button asChild size="sm" className="mt-3 w-full">
                <Link href="/dashboard/billing" onClick={() => setOpen(false)}>
                  Upgrade plan
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="w-40">
              {FORMATS.map(([format, label]) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onExport(format);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
