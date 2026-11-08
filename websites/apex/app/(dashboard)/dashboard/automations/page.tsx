"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise } from "@unifesto/unicon/react";
import { listAutomations, type Automation, type AutomationChannel } from "@/lib/api/automations-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CHANNEL: Record<AutomationChannel, string> = { push: "Push", inapp: "In-app", email: "Email", whatsapp: "WhatsApp" };

/** "1,204 sent · 312 opened · 3 failed · 40 skipped" from one channel's delivery rows. */
function deliveryLine(s: Record<string, number>, opened: string | null): string {
  const n = (k: string) => s[k] ?? 0;
  const sent = n("SENT") + n("DELIVERED") + n("OPENED");
  const skipped = n("SKIPPED") + n("SUPPRESSED");
  return [
    `${sent.toLocaleString("en-IN")} sent`,
    opened && n("OPENED") ? `${n("OPENED").toLocaleString("en-IN")} ${opened}` : null,
    n("FAILED") ? `${n("FAILED")} failed` : null,
    skipped ? `${skipped.toLocaleString("en-IN")} skipped` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function AutomationsPage() {
  const [days, setDays] = useState(30);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await listAutomations(days);
    if (error) setError(error.message);
    else if (data) setAutomations(data.automations);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = [...new Set(automations.map((a) => a.group))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Automations"
        subtitle="Every message Unifesto sends on its own, and what it sent"
        actions={
          <div className="flex gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-36" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}>
              <ArrowsClockwise className="mr-1.5 h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />

      <p className="text-sm text-muted-foreground">
        Counts come from the delivery log, so in-app copies aren&apos;t counted, and messages from before 8 Nov 2026 may show no count.
        Organisers can switch the ones marked optional off for one event, from the event&apos;s settings.
      </p>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{group}</h2>
            <Card>
              <CardContent className="divide-y divide-border py-0">
                {automations
                  .filter((a) => a.group === group)
                  .map((a) => (
                    <div key={a.key} className="space-y-1 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="font-medium text-foreground">{a.name}</span>
                        <span className="text-xs text-muted-foreground">{a.channels.map((c) => CHANNEL[c]).join(", ")}</span>
                        {a.switchable && (
                          <span className="text-xs text-warning">
                            {a.switchable === "feedback" ? "Optional (the event's feedback switch)" : "Optional per event"}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {a.when}. To {a.to.charAt(0).toLowerCase() + a.to.slice(1)}.
                      </p>
                      {Object.keys(a.counts).length > 0 ? (
                        <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
                          {(Object.entries(a.counts) as [AutomationChannel, Record<string, number>][]).map(([ch, s]) => (
                            <div key={ch} className="contents">
                              <dt className="text-muted-foreground">{CHANNEL[ch]}</dt>
                              <dd className="text-foreground">{deliveryLine(s, ch === "email" ? "opened" : ch === "whatsapp" ? "read" : null)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nothing sent in this period.</p>
                      )}
                    </div>
                  ))}
              </CardContent>
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
