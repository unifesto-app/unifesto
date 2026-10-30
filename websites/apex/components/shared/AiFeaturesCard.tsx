"use client";

import { useEffect, useState } from "react";
import { Sparkle } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { getAiUsage, getPlatformConfig, updatePlatformConfig, type AiUsage } from "@/lib/api/subscriptions-api";

/** What each AI feature does, in the words an admin needs to decide. Unknown keys still list. */
const ABOUT: Record<string, { name: string; body: string }> = {
  triage: { name: "Support triage", body: "Sorts new support cases by topic and urgency." },
  bot: { name: "Assist bot", body: "Answers attendees in chat and hands off to a person." },
  desk: { name: "Desk copilot", body: "Drafts replies and summaries for support staff. Staff send them." },
  event_draft: { name: "Event drafts", body: "Turns a poster or notes into a draft event for curators." },
  report_summary: { name: "Report summaries", body: "Writes the summary paragraph on event reports." },
  blog_writer: { name: "Auto-blog writer", body: "Researches queued questions and publishes up to 3 posts a day." },
};

const usd = (n: number) => (n === 0 ? "$0" : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One line of a feature's last 30 days, or null when it never ran. */
function usageLine(u?: AiUsage): string | null {
  if (!u?.runs) return null;
  const failed = u.refused + u.error;
  return [
    `${u.runs.toLocaleString("en-IN")} calls`,
    usd(u.costUsd),
    failed ? `${failed} failed (${pct(failed / u.runs)})` : "none failed",
    `${pct(u.cacheShare)} cached`,
    `${(u.avgLatencyMs / 1000).toFixed(1)}s avg`,
  ].join(" · ");
}

/** Platform kill switch for each AI feature (PlatformConfig.aiEnabledFeatures), with its last 30 days. */
export function AiFeaturesCard() {
  const [all, setAll] = useState<string[] | null>(null);
  const [enabled, setEnabled] = useState<string[]>([]);
  const [usage, setUsage] = useState<Record<string, AiUsage>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformConfig().then(({ data, error }) => {
      if (error) setError(error.message || "Failed to load");
      else if (data) {
        setAll(data.aiFeatures ?? []);
        setEnabled(data.aiEnabledFeatures ?? []);
      }
    });
    // Numbers are extra: without them the switches still work.
    getAiUsage().then(({ data }) => data && setUsage(data));
  }, []);
  const totalUsd = Object.values(usage).reduce((s, u) => s + u.costUsd, 0);

  const toggle = async (feature: string) => {
    const on = enabled.includes(feature);
    const name = ABOUT[feature]?.name ?? feature;
    const ok = await confirmDialog({
      title: on ? `Turn off ${name}?` : `Turn on ${name}?`,
      description: on
        ? "It stops on every server within a few seconds. Nothing already written is removed."
        : "It starts calling Claude and uses API credit. Daily caps per user still apply.",
      confirmLabel: on ? "Turn off" : "Turn on",
      destructive: on,
    });
    if (!ok) return;
    setBusy(feature);
    setError(null);
    const next = on ? enabled.filter((f) => f !== feature) : [...enabled, feature];
    const { data, error } = await updatePlatformConfig({ aiEnabledFeatures: next });
    if (error) setError(error.message || "Failed to save");
    else if (data) setEnabled(data.aiEnabledFeatures ?? []);
    setBusy(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkle className="h-5 w-5" weight="fill" /> AI features
        </CardTitle>
        <CardDescription>
          Each feature runs only while it is on here, even with the Anthropic key set. Turning one off
          stops it at once.
          {Object.keys(usage).length > 0 && ` Last 30 days: ${usd(totalUsd)} in all.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {all === null && !error ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          all?.map((f) => {
            const on = enabled.includes(f);
            return (
              <div key={f} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ABOUT[f]?.name ?? f}{" "}
                    <span className={`font-semibold ${on ? "text-success" : "text-muted-foreground"}`}>
                      {on ? "On" : "Off"}
                    </span>
                  </p>
                  {ABOUT[f] && <p className="text-xs text-muted-foreground">{ABOUT[f].body}</p>}
                  {usageLine(usage[f]) && (
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">Last 30 days: {usageLine(usage[f])}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  aria-pressed={on}
                  variant={on ? "default" : "outline"}
                  onClick={() => void toggle(f)}
                  disabled={busy !== null}
                >
                  {busy === f ? "Saving" : on ? "Turn off" : "Turn on"}
                </Button>
              </div>
            );
          })
        )}
        {error && <p className="pt-3 text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
