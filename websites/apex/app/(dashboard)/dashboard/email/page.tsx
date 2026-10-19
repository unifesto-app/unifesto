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
} from "@unifesto/unicon/react";
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
  ALL_USERS: "All users",
  ORGANISERS_ONLY: "Organisers",
  SEGMENT: "Segment",
  SPACE_MEMBERS: "Space members",
  EVENT_REGISTRANTS: "Event registrants",
  WAITLIST: "Waitlist",
  SINGLE_USER: "Single user",
};

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await listCampaigns({ page, limit: PAGE_SIZE });
    if (error) setError(error.message);
    else if (data) {
      setCampaigns(data.data);
      setTotal(data.meta.total);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSent = campaigns.reduce((s, c) => s + c.totalSent, 0);
  const totalOpens = campaigns.reduce((s, c) => s + c.openCount, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clickCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email campaigns"
        subtitle="Broadcast email to platform audiences, with open and click tracking."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/email/templates">
                <Cards className="mr-1.5 h-4 w-4" /> Templates
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/email/new">
                <Plus className="mr-1.5 h-4 w-4" /> Compose
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Campaigns" value={total} icon={EnvelopeSimple} tone="brand" />
        <StatCard title="Emails sent (page)" value={totalSent} icon={PaperPlaneTilt} />
        <StatCard title="Opens (page)" value={totalOpens} icon={Eye} tone="success" />
        <StatCard title="Clicks (page)" value={totalClicks} icon={CursorClick} tone="success" />
      </div>

      {error && <ErrorNotice message={error} />}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={EnvelopeSimple}
          title="No campaigns yet"
          description="Compose your first broadcast to reach users, organisers, or a segment."
          action={
            <Button asChild>
              <Link href="/dashboard/email/new">
                <Plus className="mr-1.5 h-4 w-4" /> Compose
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Audience</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Sent</th>
                    <th className="px-4 py-3 text-right font-medium">Open</th>
                    <th className="px-4 py-3 text-right font-medium">Click</th>
                    <th className="px-4 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/email/${c.id}`}
                          className="font-medium text-foreground hover:text-primary"
                        >
                          {c.subject}
                        </Link>
                        {c.subjectB && (
                          <Badge variant="neutral" className="ml-2">
                            A/B
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {TARGET_LABEL[c.targetType] ?? c.targetType}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_BADGE[c.status].variant}>
                          {STATUS_BADGE[c.status].label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.totalSent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {pct(c.openCount, c.totalSent)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {pct(c.clickCount, c.totalSent)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(c.sentAt ?? c.scheduledAt ?? c.createdAt).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / PAGE_SIZE)}
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
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <ArrowsClockwise className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
