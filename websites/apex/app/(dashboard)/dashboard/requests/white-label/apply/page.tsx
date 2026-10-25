"use client";

import { useEffect, useRef, useState } from "react";
import {
  MagicWand,
  MagnifyingGlass,
  Buildings,
  CalendarBlank,
  CheckCircle,
  WarningCircle,
  X,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAllSpacesAdmin } from "@/lib/api/spaces-api";
import { getAllEventsAdmin } from "@/lib/api/admin-events-api";
import {
  adminApplySpaceBranding,
  adminApplyEventBranding,
  setSpaceBrandingSuspended,
  type AdminApplyBrandingInput,
  type AdminApplyBrandingResult,
} from "@/lib/api/white-label-api";

type TargetType = "space" | "event";

/** A chosen space or event to brand — normalised to what the picker needs. */
interface Target {
  id: string;
  label: string;
  sublabel?: string;
  /** Current state, so the form starts from what's live instead of a default. */
  whiteLabelEnabled: boolean;
  brandColor: string | null;
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const DEFAULT_COLOR = "#3491ff";

/**
 * Admin surface. Spaces brand themselves (self-serve, plan-gated); this page
 * lets an admin apply or remove branding on any space or event, and suspend a
 * space's branding outright (kill switch, theme kept). The plan gate is still
 * enforced at render time, so the response reports `willRender`.
 */
export default function ApplyWhiteLabelPage() {
  const [targetType, setTargetType] = useState<TargetType>("space");
  const [target, setTarget] = useState<Target | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [color, setColor] = useState(DEFAULT_COLOR);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AdminApplyBrandingResult | null>(null);

  // Switching what we're branding invalidates the current selection + result.
  function switchType(next: TargetType) {
    if (next === targetType) return;
    setTargetType(next);
    setTarget(null);
    setResult(null);
    setError("");
  }

  function pick(t: Target) {
    setTarget(t);
    // Start from the target's live branding so "Apply" never silently
    // overwrites a colour the space or event already has.
    setEnabled(t.whiteLabelEnabled);
    setColor(t.brandColor ?? (t.whiteLabelEnabled ? "" : DEFAULT_COLOR));
    setResult(null);
    setError("");
  }

  async function apply() {
    if (!target) return;
    if (enabled && color && !HEX.test(color.trim())) {
      setError("Accent colour must be a hex value like #3491ff.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);

    const trimmedColor = color.trim();
    const input: AdminApplyBrandingInput = enabled
      ? {
          enabled: true,
          // An empty field means the admin cleared it → send null to wipe the
          // stored colour (public page falls back to the default theme).
          brandColor: trimmedColor === "" ? null : trimmedColor,
        }
      : { enabled: false };

    const { data, error: apiError } =
      targetType === "space"
        ? await adminApplySpaceBranding(target.id, input)
        : await adminApplyEventBranding(target.id, input);

    if (apiError) setError(apiError.message || "Could not apply white-label.");
    else setResult(data);
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Manage white-label"
        subtitle="Apply, remove or suspend branding on any space or event"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MagicWand className="h-4 w-4" />
            Target
          </CardTitle>
          <CardDescription>
            Choose whether to brand a whole space or a single event, then search
            for it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Space / Event segmented control. */}
          <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {(
              [
                { value: "space", label: "Space", icon: Buildings },
                { value: "event", label: "Event", icon: CalendarBlank },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => switchType(opt.value)}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                  (targetType === opt.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </button>
            ))}
          </div>

          {target ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-medium text-foreground">
                  {target.label}
                </span>
                {target.sublabel && (
                  <span className="text-muted-foreground"> · {target.sublabel}</span>
                )}
              </span>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setTarget(null)}
              >
                <X className="h-3.5 w-3.5" />
                Change
              </button>
            </div>
          ) : (
            <TargetSearch
              key={targetType}
              targetType={targetType}
              onPick={pick}
            />
          )}
        </CardContent>
      </Card>

      {target && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
            <CardDescription>
              Enable white-label to set an accent colour, or disable to turn it
              off for this {targetType}.{" "}
              {targetType === "space" &&
                "Events under the space inherit its colour unless they have their own."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <ErrorNotice message={error} />}

            {/* Enable / disable segmented control. */}
            <div className="space-y-1.5">
              <Label id="apply-white-label-label">White-label</Label>
              <div role="group" aria-labelledby="apply-white-label-label" className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
                {(
                  [
                    { value: true, label: "Enable" },
                    { value: false, label: "Disable" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setEnabled(opt.value)}
                    className={
                      "rounded-md px-3 py-1 text-sm font-medium transition-colors " +
                      (enabled === opt.value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {enabled && (
              <div className="max-w-sm">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-color">Accent colour</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="wl-color"
                      type="color"
                      value={HEX.test(color) ? color : DEFAULT_COLOR}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
                    />
                    <Input
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="No accent colour"
                      className="font-mono"
                    />
                  </div>
                  {color.trim() === "" ? (
                    <p className="text-xs text-muted-foreground">
                      No accent colour — the public {targetType} page uses the
                      default theme colour.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setColor("")}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Clear colour
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button onClick={apply} disabled={busy}>
                <MagicWand className="h-4 w-4" />
                {busy
                  ? "Applying…"
                  : enabled
                    ? "Apply white-label"
                    : "Turn off white-label"}
              </Button>
            </div>

            {result && <ResultNotice result={result} targetType={targetType} />}
          </CardContent>
        </Card>
      )}

      {target && targetType === "space" && <SuspendCard spaceId={target.id} />}
    </div>
  );
}

/** Kill switch: hides a space's branding everywhere without deleting its theme. */
function SuspendCard({ spaceId }: { spaceId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<"suspended" | "restored" | null>(null);

  async function run(suspended: boolean) {
    setBusy(true);
    setError("");
    const { error: apiError } = await setSpaceBrandingSuspended(spaceId, suspended);
    if (apiError) setError(apiError.message || "Could not update suspension.");
    else setState(suspended ? "suspended" : "restored");
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suspend branding</CardTitle>
        <CardDescription>
          For abuse or impersonation. Attendees see the default Unifesto look; the space keeps its
          settings but can&rsquo;t make them render until you restore it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <ErrorNotice message={error} />}
        <div className="flex gap-2">
          <Button variant="destructive" onClick={() => run(true)} disabled={busy}>
            Suspend
          </Button>
          <Button variant="outline" onClick={() => run(false)} disabled={busy}>
            Restore
          </Button>
        </div>
        {state && (
          <p className="text-sm text-muted-foreground">
            Branding {state}. Event pages refresh on their next load.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Outcome banner — distinguishes "live" from "stored but plan-gated". */
function ResultNotice({
  result,
  targetType,
}: {
  result: AdminApplyBrandingResult;
  targetType: TargetType;
}) {
  if (!result.whiteLabelEnabled) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4" weight="fill" />
        White-label turned off for this {targetType}.
      </div>
    );
  }
  if (result.willRender) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
        <CheckCircle className="h-4 w-4" weight="fill" />
        Applied — this {targetType}&rsquo;s branding is now live.
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" weight="fill" />
      <span>
        Saved, but it won&rsquo;t show publicly yet — the owning space&rsquo;s
        plan doesn&rsquo;t include white-label. It goes live automatically once
        the plan includes it.
      </span>
    </div>
  );
}

/** Debounced search-and-select for a space or event target. */
function TargetSearch({
  targetType,
  onPick,
}: {
  targetType: TargetType;
  onPick: (t: Target) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Target[]>([]);
  const [searching, setSearching] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      if (targetType === "space") {
        const { data } = await getAllSpacesAdmin({ search: term, limit: 10 });
        if (id !== reqId.current) return;
        setResults(
          (data?.spaces ?? []).map((s) => ({
            id: s.id,
            label: s.name,
            sublabel: `/${s.slug}`,
            whiteLabelEnabled: s.white_label_enabled,
            brandColor: s.brand_color,
          }))
        );
      } else {
        const { data } = await getAllEventsAdmin({ search: term, limit: 10 });
        if (id !== reqId.current) return;
        setResults(
          (data?.events ?? []).map((e) => ({
            id: e.id,
            label: e.title,
            sublabel: e.space?.name ?? `/${e.slug}`,
            whiteLabelEnabled: e.whiteLabelEnabled,
            brandColor: e.brandColor,
          }))
        );
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [query, targetType]);

  return (
    <div className="relative">
      <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder={
          targetType === "space"
            ? "Search spaces by name or slug…"
            : "Search events by title…"
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
          {searching ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No {targetType === "space" ? "spaces" : "events"} found.
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onPick(r)}
                  >
                    <span className="truncate font-medium text-foreground">
                      {r.label}
                    </span>
                    {r.sublabel && (
                      <span className="truncate text-xs text-muted-foreground">
                        {r.sublabel}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
