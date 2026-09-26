"use client";

import { ArrowsClockwise } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import {
  type RecurrenceState,
  type RecurrenceFreq,
  type RecurrenceEnd,
  WEEKDAY_LABELS,
  describeRecurrence,
} from "@/lib/recurrence";

const FREQS: { value: RecurrenceFreq; label: string }[] = [
  { value: "DAILY", label: "Day" },
  { value: "WEEKLY", label: "Week" },
  { value: "MONTHLY", label: "Month" },
  { value: "YEARLY", label: "Year" },
];

/**
 * Compose a recurring schedule (event-calendar P2). Emits a RecurrenceState the
 * caller turns into an RRULE via `buildRRule`. Kept presentational — all state
 * lives with the parent form so it round-trips through submit/reset cleanly.
 */
export function RecurrenceEditor({
  value,
  onChange,
  disabled,
  hideToggle,
}: {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
  disabled?: boolean;
  /**
   * Hide the "Does not repeat / Repeats" toggle and always show the rule
   * controls. Used on the edit page, where the event is already a series and
   * can only have its schedule changed, not be un-recurred (a v1 constraint).
   */
  hideToggle?: boolean;
}) {
  const set = (patch: Partial<RecurrenceState>) => onChange({ ...value, ...patch });
  const showParams = hideToggle || value.enabled;

  const toggleWeekday = (d: number) => {
    const has = value.weekdays.includes(d);
    const next = has
      ? value.weekdays.filter((x) => x !== d)
      : [...value.weekdays, d];
    // Never allow an empty weekday set for a weekly rule.
    set({ weekdays: next.length ? next : value.weekdays });
  };

  const unitLabel =
    { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[value.freq] +
    (value.interval > 1 ? "s" : "");

  return (
    <div className="rounded-lg border border-border">
      {/* Repeat on/off */}
      {!hideToggle && (
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {[
          { on: false, label: "Does not repeat", hint: "A single event" },
          { on: true, label: "Repeats", hint: "A recurring series" },
        ].map((o) => {
          const active = value.enabled === o.on;
          return (
            <button
              key={String(o.on)}
              type="button"
              disabled={disabled}
              onClick={() => set({ enabled: o.on })}
              aria-pressed={active}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:opacity-60",
                active
                  ? "border-primary bg-primary-soft/40"
                  : "border-border hover:border-border-strong"
              )}
            >
              <ArrowsClockwise
                className={cn(
                  "mt-0.5 h-[18px] w-[18px] flex-shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                weight={active && o.on ? "fill" : "regular"}
              />
              <span>
                <span className="block text-sm font-medium text-foreground">
                  {o.label}
                </span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      )}

      {showParams && (
        <div
          className={cn(
            "space-y-4 p-3",
            !hideToggle && "border-t border-border"
          )}
        >
          {/* Frequency + interval */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-interval">Repeat every</Label>
              <Input
                id="rec-interval"
                type="number"
                min={1}
                max={99}
                disabled={disabled}
                value={value.interval}
                onChange={(e) =>
                  set({ interval: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-20"
              />
            </div>
            <div className="min-w-[130px] flex-1 space-y-1.5">
              <Label htmlFor="rec-freq" className="opacity-0">
                Unit
              </Label>
              <Select
                value={value.freq}
                onValueChange={(v) => set({ freq: v as RecurrenceFreq })}
                disabled={disabled}
              >
                <SelectTrigger id="rec-freq">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {value.interval > 1 ? `${f.label}s` : f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weekday picker (weekly only) */}
          {value.freq === "WEEKLY" && (
            <div className="space-y-1.5">
              <Label>On these days</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, d) => {
                  const active = value.weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleWeekday(d)}
                      aria-pressed={active}
                      className={cn(
                        "h-9 w-11 rounded-lg border text-xs font-medium transition-colors disabled:opacity-60",
                        active
                          ? "border-primary bg-primary-soft/50 text-primary"
                          : "border-border text-muted-foreground hover:border-border-strong"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* End condition */}
          <div className="space-y-1.5">
            <Label>Ends</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  { value: "count", label: "After" },
                  { value: "until", label: "On date" },
                  { value: "never", label: "Ongoing" },
                ] as { value: RecurrenceEnd; label: string }[]
              ).map((o) => {
                const active = value.end === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    disabled={disabled}
                    onClick={() => set({ end: o.value })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60",
                      active
                        ? "border-primary bg-primary-soft/40 text-foreground"
                        : "border-border text-muted-foreground hover:border-border-strong"
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            {value.end === "count" && (
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  disabled={disabled}
                  value={value.count}
                  onChange={(e) =>
                    set({ count: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  occurrence{value.count === 1 ? "" : "s"}
                </span>
              </div>
            )}
            {value.end === "until" && (
              <Input
                type="date"
                disabled={disabled}
                value={value.until}
                onChange={(e) => set({ until: e.target.value })}
                className="mt-1 w-52"
              />
            )}
            {value.end === "never" && (
              <p className="pt-1 text-xs text-muted-foreground">
                We keep about 12 months of dates scheduled ahead and extend the
                series automatically.
              </p>
            )}
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-xs font-medium text-foreground">
            {describeRecurrence(value)}
            <span className="text-muted-foreground">
              {" "}
              · repeats from the event&apos;s start date
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
