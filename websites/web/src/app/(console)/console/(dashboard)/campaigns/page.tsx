"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PaperPlaneTilt, Plus } from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  cancelCampaign,
  listCampaigns,
  type Campaign,
  type CampaignAudience,
  type CampaignChannel,
  type CampaignStatus,
} from "@/console/lib/api/campaigns-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent } from "@/console/components/ui/card";

const PAGE_SIZE = 20;

const STATUS: Record<CampaignStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "text-muted-foreground" },
  SCHEDULED: { label: "Scheduled", tone: "text-warning" },
  SENDING: { label: "Sending", tone: "text-foreground" },
  SENT: { label: "Sent", tone: "text-success" },
  FAILED: { label: "Didn't send", tone: "text-destructive" },
  CANCELLED: { label: "Cancelled", tone: "text-muted-foreground" },
  HELD: { label: "Unifesto is checking it", tone: "text-warning" },
};

const AUDIENCE: Record<CampaignAudience["type"], string> = {
  space: "All space members",
  event: "Event attendees",
  not_checked_in: "Attendees not checked in yet",
  waitlist: "Event waitlist",
  users: "One member",
};

/** "2 h before the start", "30 min after the start". */
function relative(min: number): string {
  if (min === 0) return "at the start";
  const abs = Math.abs(min);
  const amount = abs < 60 ? `${abs} min` : `${Number((abs / 60).toFixed(1))} h`;
  return `${amount} ${min < 0 ? "before" : "after"} the start`;
}

const CHANNEL: Record<CampaignChannel, string> = { push: "Push and in-app", inapp: "In-app", email: "Email" };

const ticketCount = (n?: number) => (n ? `${n} ${n === 1 ? "ticket" : "tickets"}` : null);

/** "120 sent · 40 opened · 2 failed · 3 tickets" from one channel's delivery rows. */
function deliveryLine(s: Record<string, number> | undefined, tickets?: number): string | null {
  if (!s) return null;
  const sent = (s.SENT ?? 0) + (s.DELIVERED ?? 0) + (s.OPENED ?? 0);
  const skipped = (s.SKIPPED ?? 0) + (s.SUPPRESSED ?? 0);
  return [
    `${sent} sent`,
    s.OPENED ? `${s.OPENED} opened` : null,
    s.FAILED ? `${s.FAILED} failed` : null,
    skipped ? `${skipped} skipped` : null,
    ticketCount(tickets),
  ]
    .filter(Boolean)
    .join(" · ");
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export default function SpaceCampaignsPage() {
  const spaceId = useSpaceId();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    setError(null);
    const { data, error } = await listCampaigns(spaceId, { page, limit: PAGE_SIZE });
    if (error) setError(error.message);
    else if (data) {
      setCampaigns(data.campaigns);
      setTotal(data.total);
    }
    setLoading(false);
  }, [spaceId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async (id: string) => {
    const { error } = await cancelCampaign(spaceId, id);
    if (error) setError(error.message);
    else void load();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Campaigns"
        subtitle="Tell your members and attendees something, as a notification, an email, or both."
        actions={
          <Button asChild>
            <Link href="/console/campaigns/new">
              <Plus className="mr-1.5 h-4 w-4" weight="bold" /> New campaign
            </Link>
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={PaperPlaneTilt}
          title="No campaigns yet"
          description="Write one message and send it to your members or an event's attendees as a notification, an email, or both."
          tone="positive"
          action={
            <Button asChild>
              <Link href="/console/campaigns/new">
                <Plus className="mr-1.5 h-4 w-4" weight="bold" /> New campaign
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {campaigns.map((c) => {
            const t = c.counts.tickets ?? {};
            const inApp = [c.counts.inapp !== undefined ? `${c.counts.inapp} delivered` : null, ticketCount(t.inapp)];
            const lines: Array<[string, string | null]> = [
              ["Push", deliveryLine(c.counts.push, t.push)],
              ["In-app", inApp.filter(Boolean).join(" · ") || null],
              ["Email", deliveryLine(c.counts.email, t.email)],
            ];
            return (
              <Card key={c.id}>
                <CardContent className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm font-medium ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                    <span className="font-semibold text-foreground">
                      {c.content.push?.title ?? c.content.email?.subject ?? "Campaign"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.status === "SCHEDULED"
                        ? `For ${when(c.scheduledAt)}${c.offsetMinutes != null ? ` (${relative(c.offsetMinutes)})` : ""}`
                        : when(c.sentAt ?? c.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {AUDIENCE[c.audience.type]}
                    {c.recipientCount ? ` · ${c.recipientCount} people` : ""} · {c.channels.map((ch) => CHANNEL[ch]).join(", ")}
                  </p>
                  {lines.some(([, l]) => l) && (
                    <dl className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-[auto_1fr]">
                      {lines.map(([name, line]) =>
                        line ? (
                          <div key={name} className="contents">
                            <dt className="text-muted-foreground">{name}</dt>
                            <dd className="text-foreground">{line}</dd>
                          </div>
                        ) : null
                      )}
                    </dl>
                  )}
                  {c.status === "HELD" && (
                    <p className="text-xs text-muted-foreground">
                      Nothing has gone out yet. It sends as written once Unifesto clears it.
                    </p>
                  )}
                  {c.error && <p className="whitespace-pre-line text-xs text-destructive">{c.error}</p>}
                  {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                    <Button size="sm" variant="outline" onClick={() => cancel(c.id)}>
                      Cancel
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
