"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  EnvelopeSimple,
  PaperPlaneTilt,
  Eye,
  CursorClick,
  Plus,
  Cards,
  ArrowsClockwise,
  CaretRight,
  Users,
  CalendarBlank,
} from "@phosphor-icons/react";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import {
  listCampaigns,
  type EmailCampaign,
  type EmailCampaignStatus,
} from "@/lib/api/email-campaigns-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

const PAGE_SIZE = 20;

const STATUS_BADGE: Record<
  EmailCampaignStatus,
  { label: string; variant: "neutral" | "brand" | "success" | "warning" | "destructive" }
> = {
  PENDING: { label: "Queued", variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "warning" },
  SENDING: { label: "Sending", variant: "brand" },
  SENT: { label: "Sent", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
};

const TARGET_LABEL: Record<string, string> = {
  SPACE_MEMBERS: "All members",
  EVENT_REGISTRANTS: "Event registrants",
  WAITLIST: "Event waitlist",
  SINGLE_USER: "Single member",
};

function ratePct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

/** A percentage with a slim track underneath — engagement at a glance. */
function RateCell({
  part,
  whole,
  tone,
}: {
  part: number;
  whole: number;
  tone: "brand" | "success";
}) {
  const p = ratePct(part, whole);
  if (p === null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  return (
    <div className="ml-auto w-20">
      <div className="text-right text-sm tabular-nums text-foreground">{p}%</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={tone === "success" ? "h-full bg-success" : "h-full bg-primary"}
          style={{ width: `${Math.min(100, p)}%` }}
        />
      </div>
    </div>
  );
}

function whenLabel(c: EmailCampaign): string {
  const iso = c.sentAt ?? c.scheduledAt ?? c.createdAt;
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SpaceEmailPage() {
  const spaceId = useSpaceId();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
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
      setCampaigns(data.data);
      setTotal(data.meta.total);
    }
    setLoading(false);
  }, [spaceId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Pooled across the campaigns on this page — a truer read than averaging
  // per-campaign rates (which over-weights tiny sends).
  const totalSent = campaigns.reduce((s, c) => s + c.totalSent, 0);
  const totalOpens = campaigns.reduce((s, c) => s + c.openCount, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clickCount, 0);
  const openRate = ratePct(totalOpens, totalSent);
  const clickRate = ratePct(totalClicks, totalSent);
  const pageHint =
    campaigns.length > 0 ? `Across ${campaigns.length} shown` : "No data yet";
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Email"
        title="Campaigns"
        subtitle="Broadcast to your members and event audiences, with open and click tracking."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/email/templates">
                <Cards className="mr-1.5 h-4 w-4" /> Templates
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/email/new">
                <Plus className="mr-1.5 h-4 w-4" weight="bold" /> Compose
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Campaigns"
          value={total}
          hint="All time"
          icon={EnvelopeSimple}
          tone="brand"
          loading={loading}
        />
        <StatCard
          title="Emails sent"
          value={totalSent.toLocaleString("en-IN")}
          hint={pageHint}
          icon={PaperPlaneTilt}
          loading={loading}
        />
        <StatCard
          title="Open rate"
          value={openRate === null ? "—" : `${openRate}%`}
          hint={pageHint}
          icon={Eye}
          tone="success"
          loading={loading}
        />
        <StatCard
          title="Click rate"
          value={clickRate === null ? "—" : `${clickRate}%`}
          hint={pageHint}
          icon={CursorClick}
          tone="success"
          loading={loading}
        />
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={EnvelopeSimple}
              tone="positive"
              title="No campaigns yet"
              description="Compose your first broadcast to your members or an event's audience. You'll see opens and clicks here once it sends."
              action={
                <Button asChild>
                  <Link href="/dashboard/email/new">
                    <Plus className="mr-1.5 h-4 w-4" weight="bold" /> Compose
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Column key — hidden on small screens where rows stack. */}
          <div className="hidden items-center gap-4 border-b border-border px-4 py-2.5 md:flex">
            <span className="text-eyebrow flex-1">Campaign</span>
            <span className="text-eyebrow w-24">Status</span>
            <span className="text-eyebrow w-16 text-right">Sent</span>
            <span className="text-eyebrow w-20 text-right">Opens</span>
            <span className="text-eyebrow w-20 text-right">Clicks</span>
            <span className="text-eyebrow w-24 text-right">Date</span>
            <span className="w-4" aria-hidden />
          </div>

          <ul className="divide-y divide-border">
            {campaigns.map((c) => {
              const status = STATUS_BADGE[c.status];
              return (
                <li key={c.id}>
                  <Link
                    href={`/dashboard/email/${c.id}`}
                    className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 md:flex-row md:items-center md:gap-4"
                  >
                    {/* Subject + audience */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {c.subject}
                        </p>
                        {c.subjectB && <Badge variant="brand">A/B</Badge>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {TARGET_LABEL[c.targetType] ?? c.targetType}
                        </span>
                      </div>
                    </div>

                    <div className="w-24 flex-shrink-0">
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>

                    <div className="w-16 flex-shrink-0 text-right text-sm tabular-nums text-foreground">
                      {c.totalSent.toLocaleString("en-IN")}
                    </div>

                    <div className="flex w-20 flex-shrink-0 justify-end">
                      <RateCell part={c.openCount} whole={c.totalSent} tone="brand" />
                    </div>

                    <div className="flex w-20 flex-shrink-0 justify-end">
                      <RateCell
                        part={c.clickCount}
                        whole={c.totalSent}
                        tone="success"
                      />
                    </div>

                    <div className="flex w-24 flex-shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground">
                      <CalendarBlank className="h-3.5 w-3.5" />
                      {whenLabel(c)}
                    </div>

                    <CaretRight className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground md:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              aria-label="Refresh"
            >
              <ArrowsClockwise className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
