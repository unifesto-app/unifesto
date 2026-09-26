"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  PaperPlaneTilt,
  Eye,
  CursorClick,
  XCircle,
  ArrowLeft,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  getCampaign,
  cancelCampaign,
  type EmailCampaignDetail,
} from "@/lib/api/email-campaigns-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<EmailCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getCampaign(id);
    if (error) setError(error.message);
    else setC(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    const { error } = await cancelCampaign(id);
    if (error) setError(error.message);
    else void load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) return <ErrorNotice message={error} />;
  if (!c) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.subject}
        subtitle={
          <span className="flex items-center gap-2">
            <Badge variant="neutral">{c.targetType}</Badge>
            {c.subjectB && <Badge variant="brand">A/B test</Badge>}
            <span>
              {c.status} ·{" "}
              {new Date(c.sentAt ?? c.scheduledAt ?? c.createdAt).toLocaleString()}
            </span>
          </span>
        }
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push("/dashboard/email")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            {c.status === "SCHEDULED" && (
              <Button variant="destructive" onClick={cancel}>
                <XCircle className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Sent" value={c.totalSent} icon={PaperPlaneTilt} tone="brand" />
        <StatCard title="Failed" value={c.failedCount} icon={WarningCircle} />
        <StatCard
          title="Opens"
          value={`${c.openCount} (${pct(c.openCount, c.totalSent)})`}
          icon={Eye}
          tone="success"
        />
        <StatCard
          title="Clicks"
          value={`${c.clickCount} (${pct(c.clickCount, c.totalSent)})`}
          icon={CursorClick}
          tone="success"
        />
      </div>

      {c.stats && (
        <Card>
          <CardHeader>
            <CardTitle>A/B subject results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {(["a", "b"] as const).map((k) => {
                const v = c.stats![k];
                return (
                  <div key={k} className="rounded-md border border-border p-4">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium">
                        Variant {k.toUpperCase()}
                      </span>
                      <Badge variant="neutral">{v.sent} sent</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {k === "a" ? c.subject : c.subjectB}
                    </p>
                    <div className="mt-3 flex gap-6 text-sm">
                      <span>Open {pct(v.opens, v.sent)}</span>
                      <span>Click {pct(v.clicks, v.sent)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recipients ({c.logs.length} shown)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Recipient</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Variant</th>
                  <th className="px-4 py-2 font-medium">Opened</th>
                  <th className="px-4 py-2 font-medium">Clicked</th>
                </tr>
              </thead>
              <tbody>
                {c.logs.map((l) => (
                  <tr key={l.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">{l.recipientEmail}</td>
                    <td className="px-4 py-2">
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
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.variant ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.openedAt ? new Date(l.openedAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {l.firstClickedAt
                        ? new Date(l.firstClickedAt).toLocaleString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
