"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  VideoCamera,
  LinkSimple,
  User,
  Buildings,
} from "@unifesto/unicon/react";
import {
  getSessionDetailAdmin,
  PLATFORM_LABELS,
  type AdminSessionDetail,
} from "@/lib/api/admin-sessions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const money = (v: number | string) => `₹${Number(v || 0).toLocaleString("en-IN")}`;
const fmt = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AdminSessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<AdminSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getSessionDetailAdmin(sessionId);
    if (error) setError(error.message);
    else setSession(data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return <ErrorNotice message={error || "Session not found."} />;
  }

  const price = Number(session.price);
  const platform =
    session.platform === "OTHER"
      ? session.platformOther || "Online"
      : PLATFORM_LABELS[session.platform];
  const organiser = session.creator.fullName || session.creator.username || "Curator";

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        subtitle={`${session.registeredCount} registered · ${session.sales.paidRegistrations} paid`}
        actions={
          <Button variant="outline" onClick={() => router.push("/dashboard/sessions")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={session.status} />
        <Badge variant="neutral">{price > 0 ? money(price) : "Free"}</Badge>
        <Badge variant="neutral">{session.visibility}</Badge>
      </div>

      {session.status === "CANCELLED" && session.cancellationReason && (
        <ErrorNotice message={`Cancelled: ${session.cancellationReason}`} />
      )}

      {/* Sales summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Registered" value={session.registeredCount.toLocaleString("en-IN")} />
        <Stat label="Gross sales" value={money(session.sales.grossSales)} />
        <Stat label="Processing fees" value={money(session.sales.processingFees)} />
        <Stat label="Refunded" value={money(session.sales.refunded)} />
      </div>

      {/* Details */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row icon={Clock} text={`${fmt(session.startDateTime)} · ${session.durationMinutes} min · ${session.timezone}`} />
          <Row icon={VideoCamera} text={platform} />
          {session.meetingUrl ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LinkSimple className="h-4 w-4" />
              <a href={session.meetingUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                {session.meetingUrl}
              </a>
            </div>
          ) : (
            <Row icon={LinkSimple} text="Hosted in-app (no shareable link)" />
          )}
          <Row icon={User} text={`${organiser} · ${session.creator.email || session.creator.mobileNumber || "—"}`} />
          <Row icon={Buildings} text={session.space?.name ?? "—"} />
          {session.description && (
            <p className="whitespace-pre-wrap pt-2 text-foreground">{session.description}</p>
          )}
          {session.recordingUrl && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LinkSimple className="h-4 w-4" />
              <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
                Recording
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attendees */}
      <Card>
        <CardHeader>
          <CardTitle>Attendees ({session.attendees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {session.attendees.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No registrations yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Contact</th>
                    <th className="py-2 pr-4 font-medium">Payment</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {session.attendees.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{a.user.fullName || a.user.username || "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{a.user.email || a.user.mobileNumber || "—"}</td>
                      <td className="py-2 pr-4"><StatusBadge status={a.paymentStatus} /></td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {Number(a.totalAmount) > 0 ? money(a.totalAmount) : "Free"}
                        {Number(a.refundedAmount) > 0 ? ` · −${money(a.refundedAmount)}` : ""}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">{a.joinedAt ? "Yes" : "—"}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Row({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{text}</span>
    </div>
  );
}
