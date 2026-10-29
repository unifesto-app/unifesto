"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  PaperPlaneTilt,
  Eye,
  CursorClick,
  XCircle,
  ArrowLeft,
  WarningCircle,
  Trophy,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import {
  getCampaign,
  cancelCampaign,
  type EmailCampaignDetail,
} from "@/console/lib/api/email-campaigns-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { StatCard } from "@/console/components/shared/StatCard";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { StatusBadge } from "@/console/components/shared/StatusBadge";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import { cn } from "@/console/lib/utils/cn";

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

function rateLabel(part: number, whole: number): string {
  const p = ratePct(part, whole);
  return p === null ? "—" : `${p}%`;
}

export default function SpaceCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const spaceId = useSpaceId();
  const router = useRouter();
  const [c, setC] = useState<EmailCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await getCampaign(spaceId, id);
    if (error) setError(error.message);
    else setC(data);
    setLoading(false);
  }, [spaceId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    if (!confirm("Cancel this scheduled campaign? It won't be sent.")) return;
    setCancelling(true);
    const { error } = await cancelCampaign(spaceId, id);
    setCancelling(false);
    if (error) setError(error.message);
    else void load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) return <ErrorNotice message={error} />;
  if (!c) return null;

  const when = new Date(c.sentAt ?? c.scheduledAt ?? c.createdAt).toLocaleString(
    "en-IN",
    { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }
  );

  // A/B winner by open rate — highlighted so the takeaway reads at a glance.
  const winner =
    c.stats && c.stats.a.sent && c.stats.b.sent
      ? ratePct(c.stats.a.opens, c.stats.a.sent)! >=
        ratePct(c.stats.b.opens, c.stats.b.sent)!
        ? "a"
        : "b"
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Campaign"
        title={c.subject}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            <Badge variant="neutral">
              {TARGET_LABEL[c.targetType] ?? c.targetType}
            </Badge>
            {c.subjectB && <Badge variant="brand">A/B test</Badge>}
            <span className="text-muted-foreground">{when}</span>
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/console/email">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Campaigns
              </Link>
            </Button>
            {c.status === "SCHEDULED" && (
              <Button variant="destructive" onClick={cancel} disabled={cancelling}>
                <XCircle className="mr-1.5 h-4 w-4" />
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Sent" value={c.totalSent.toLocaleString("en-IN")} icon={PaperPlaneTilt} tone="brand" />
        <StatCard
          title="Failed"
          value={c.failedCount.toLocaleString("en-IN")}
          hint={c.failedCount > 0 ? "Bounced or errored" : "All delivered"}
          icon={WarningCircle}
          tone={c.failedCount > 0 ? "neutral" : "success"}
        />
        <StatCard
          title="Open rate"
          value={rateLabel(c.openCount, c.totalSent)}
          hint={`${c.openCount.toLocaleString("en-IN")} opened`}
          icon={Eye}
          tone="success"
        />
        <StatCard
          title="Click rate"
          value={rateLabel(c.clickCount, c.totalSent)}
          hint={`${c.clickCount.toLocaleString("en-IN")} clicked`}
          icon={CursorClick}
          tone="success"
        />
      </div>

      {c.stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">A/B subject results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["a", "b"] as const).map((k) => {
                const v = c.stats![k];
                const isWinner = winner === k;
                return (
                  <div
                    key={k}
                    className={cn(
                      "rounded-lg border p-4",
                      isWinner
                        ? "border-success/40 bg-success-soft/40"
                        : "border-border"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-foreground">
                        Variant {k.toUpperCase()}
                        {isWinner && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
                            <Trophy className="h-3 w-3" weight="fill" />
                            Winner
                          </span>
                        )}
                      </span>
                      <Badge variant="neutral">{v.sent} sent</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {k === "a" ? c.subject : c.subjectB}
                    </p>
                    <div className="mt-3 flex gap-6 text-sm">
                      <span className="text-foreground">
                        <span className="text-muted-foreground">Open </span>
                        {rateLabel(v.opens, v.sent)}
                      </span>
                      <span className="text-foreground">
                        <span className="text-muted-foreground">Click </span>
                        {rateLabel(v.clicks, v.sent)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">
            Recipients{" "}
            <span className="font-normal text-muted-foreground">
              ({c.logs.length} shown)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {c.logs.length === 0 ? (
            <EmptyState
              icon={PaperPlaneTilt}
              title="No recipients yet"
              description="Delivery details appear here once this campaign starts sending."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="text-eyebrow px-4 py-2.5 font-medium">Recipient</th>
                    <th className="text-eyebrow px-4 py-2.5 font-medium">Status</th>
                    <th className="text-eyebrow px-4 py-2.5 font-medium">Variant</th>
                    <th className="text-eyebrow px-4 py-2.5 font-medium">Opened</th>
                    <th className="text-eyebrow px-4 py-2.5 font-medium">Clicked</th>
                  </tr>
                </thead>
                <tbody>
                  {c.logs.map((l) => (
                    <tr
                      key={l.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-2.5 text-foreground">{l.recipientEmail}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            l.status === "SENT"
                              ? "success"
                              : l.status === "BOUNCED"
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {l.variant ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {l.openedAt ? new Date(l.openedAt).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {l.firstClickedAt
                          ? new Date(l.firstClickedAt).toLocaleString("en-IN")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
