"use client";

import { useState } from "react";
import { IdentificationCard } from "@unifesto/unicon/react";
import { BADGE_LAYOUTS, printBadges, type BadgeLayout } from "@/lib/api/registrations-api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Badge / pass printing (N1): everyone matching the roster's filters, or the
 * selected rows, as an A4 sheet or one badge per label. Only confirmed
 * attendees get a badge; each group member gets their own.
 */
export function PrintBadgesDialog({
  eventId,
  eventSlug,
  selectedIds,
  filters,
}: {
  eventId: string;
  eventSlug?: string;
  selectedIds: string[];
  filters: { ticketTypeId?: string; status?: string; search?: string; filtered: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState<"filters" | "selected">("filters");
  const [layout, setLayout] = useState<BadgeLayout>("a4-8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancelledOnly = filters.status === "CANCELLED";
  const useSelected = who === "selected" && selectedIds.length > 0;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    setError("");
    if (next) setWho(selectedIds.length > 0 ? "selected" : "filters");
  };

  const print = async () => {
    setBusy(true);
    setError("");
    const { data, error } = await printBadges(eventId, {
      layout,
      registrationIds: useSelected ? selectedIds : undefined,
      ticketTypeId: filters.ticketTypeId,
      status: filters.status === "REGISTERED" || filters.status === "ATTENDED" ? filters.status : undefined,
      search: filters.search || undefined,
    });
    setBusy(false);
    if (error || !data) {
      setError(error?.message || "Could not print badges");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${eventSlug || eventId}-badges-${layout}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" onClick={() => onOpenChange(true)}>
        <IdentificationCard className="h-4 w-4" />
        Print badges
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print badges</DialogTitle>
            <DialogDescription>
              One badge per confirmed attendee, with the QR the check-in scanner reads. Each group
              member gets their own badge; seats nobody has claimed are left out.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Who</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  checked={!useSelected}
                  onChange={() => setWho("filters")}
                />
                {filters.filtered ? "Everyone matching the current filters" : "All confirmed attendees"}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  checked={useSelected}
                  disabled={selectedIds.length === 0}
                  onChange={() => setWho("selected")}
                />
                <span className={selectedIds.length === 0 ? "text-muted-foreground" : undefined}>
                  Selected rows ({selectedIds.length})
                </span>
              </label>
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="badge-layout">Layout</Label>
              <Select value={layout} onValueChange={(v) => setLayout(v as BadgeLayout)}>
                <SelectTrigger id="badge-layout">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_LAYOUTS.map((l) => (
                    <SelectItem key={l.key} value={l.key}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                For a label printer, print at 100% (actual size) with the matching label loaded.
              </p>
            </div>

            {cancelledOnly && (
              <p className="text-sm text-destructive">Cancelled registrations don&apos;t get badges.</p>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={print} disabled={busy || cancelledOnly}>
              {busy ? "Preparing PDF..." : "Download PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
