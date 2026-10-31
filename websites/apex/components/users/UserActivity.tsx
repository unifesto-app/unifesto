"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import backendClient, { apiCall } from "@/lib/api/backend-client";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr } from "@/lib/utils/money";

/** F6: `GET /admin/users/:id/activity`. */
interface Activity {
  registrations: {
    id: string;
    status: string;
    isWaitlisted: boolean;
    groupSize: number | null;
    checkedInAt: string | null;
    registeredAt: string;
    paymentStatus: string;
    ticketType: { name: string } | null;
    event: { id: string; title: string; startDateTime: string; space: { id: string; name: string } | null };
  }[];
  payments: {
    kind: "TICKET" | "SEATS" | "STAY";
    id: string;
    title: string;
    eventId: string | null;
    at: string;
    amount: number;
    refunded: number;
    paymentStatus: string | null;
    paymentId: string | null;
  }[];
}

const KIND_LABEL: Record<Activity["payments"][number]["kind"], string> = {
  TICKET: "Ticket",
  SEATS: "Extra seats",
  STAY: "Stay",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const th = "pb-2 pr-4 font-medium";

/** Every registration this user holds and everything they paid, newest first. */
export function UserActivity({ userId }: { userId: string }) {
  const [data, setData] = useState<Activity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiCall<Activity>(backendClient.get(`/admin/users/${userId}/activity`)).then(({ data, error }) => {
      if (error) setError(error.message);
      else setData(data);
    });
  }, [userId]);

  const empty = (text: string) => <p className="text-sm text-muted-foreground">{text}</p>;
  const body = (content: React.ReactNode) =>
    error ? <p className="text-sm text-destructive">{error}</p> : !data ? empty("Loading…") : content;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registrations ({data?.registrations.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {body(
            !data?.registrations.length ? (
              empty("No registrations.")
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                      <th className={th}>Event</th>
                      <th className={th}>Ticket</th>
                      <th className={th}>Status</th>
                      <th className={th}>Payment</th>
                      <th className="pb-2 font-medium">Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.registrations.map((r) => (
                      <tr key={r.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-4">
                          <Link href={`/dashboard/events/${r.event.id}`} className="font-medium text-foreground hover:underline">
                            {r.event.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {r.event.space?.name} · {fmt(r.event.startDateTime)}
                          </p>
                        </td>
                        <td className="py-2.5 pr-4 text-muted-foreground">
                          {r.ticketType?.name ?? "-"}
                          {r.groupSize ? ` · group of ${r.groupSize}` : ""}
                        </td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge status={r.isWaitlisted ? "waitlisted" : r.checkedInAt ? "checked_in" : r.status} />
                        </td>
                        <td className="py-2.5 pr-4">
                          <StatusBadge status={r.paymentStatus} />
                        </td>
                        <td className="py-2.5 text-muted-foreground">{fmt(r.registeredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Payments ({data?.payments.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {body(
            !data?.payments.length ? (
              empty("No payments.")
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                      <th className={th}>For</th>
                      <th className={th}>Amount</th>
                      <th className={th}>Status</th>
                      <th className={th}>Payment id</th>
                      <th className="pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={`${p.kind}-${p.id}`} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pr-4">
                          {p.kind === "TICKET" ? (
                            <Link href={`/dashboard/transactions/${p.id}`} className="font-medium text-foreground hover:underline">
                              {p.title}
                            </Link>
                          ) : (
                            <span className="font-medium text-foreground">{p.title}</span>
                          )}
                          <p className="text-xs text-muted-foreground">{KIND_LABEL[p.kind]}</p>
                        </td>
                        <td className="py-2.5 pr-4 tabular-nums">
                          {inr(p.amount)}
                          {p.refunded > 0 && (
                            <span className="block text-xs text-muted-foreground">{inr(p.refunded)} refunded</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          {p.paymentStatus ? <StatusBadge status={p.paymentStatus} /> : "-"}
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{p.paymentId ?? "-"}</td>
                        <td className="py-2.5 text-muted-foreground">{fmt(p.at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </>
  );
}
