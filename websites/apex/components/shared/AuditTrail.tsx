"use client";

import { useEffect, useState } from "react";
import backendClient, { apiCall } from "@/lib/api/backend-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** F5: one row of `GET /admin/audit`. */
interface AuditRow {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; fullName: string | null; username: string | null } | null;
  data: { params?: Record<string, string>; body?: Record<string, unknown> } | null;
}

const ACTION_LABELS: Record<string, string> = {
  "user.profile": "Profile edited",
  "user.employee": "Employee access changed",
  "user.suspend": "Suspended or banned",
  "user.unsuspend": "Suspension lifted",
  "user.logout": "Signed out everywhere",
  "user.override": "Capability override set",
  "user.override.remove": "Capability override removed",
  "space.approve": "Space approved",
  "space.reject": "Space rejected",
  "space.status": "Space status changed",
  "space.verification": "Verification changed",
  "space.request.approve": "Space request approved",
  "space.status.review": "Status request reviewed",
  "space.ownership.review": "Ownership request reviewed",
  "space.member.add": "Member added",
  "space.member.role": "Member role changed",
  "space.member.remove": "Member removed",
  "space.plan": "Plan changed",
  "space.plan.payment": "Offline plan payment",
  "space.deal": "Deal created",
  "space.deal.end": "Deal ended",
  "plan.definition": "Plan definition edited",
  "event.publish": "Event published",
  "event.cancel": "Event cancelled",
  "event.hide": "Event hidden",
  "event.restore": "Event restored",
  "event.team.add": "Team role granted",
  "event.team.remove": "Team role removed",
  "iam.matrix": "IAM matrix edited",
  "iam.space-matrix": "Space IAM override",
  "iam.space-reset": "Space IAM reset",
  "payment.reconcile": "Payment reconciled",
  "payment.resolve": "Pending payment resolved",
  "seats.reconcile": "Seat counts reconciled",
};

/** The request body as short `key: value` pairs, enough to read what changed. */
function details(row: AuditRow): string {
  return Object.entries(row.data?.body ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

/**
 * Audit trail for one entity (or an action prefix such as `iam.`): who changed
 * permissions, roles, status, plan or reconciled money here, newest first.
 */
export function AuditTrail({
  filter,
}: {
  filter: { userId?: string; spaceId?: string; eventId?: string; action?: string };
}) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState("");
  const query = new URLSearchParams(filter as Record<string, string>).toString();

  useEffect(() => {
    void apiCall<AuditRow[]>(backendClient.get(`/admin/audit?${query}`)).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
    });
  }, [query]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Audit trail</CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No admin changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-foreground">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.actor?.fullName || r.actor?.username || "System"} ·{" "}
                    {new Date(r.createdAt).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {details(r) && (
                  <p className="mt-0.5 break-words text-xs text-muted-foreground">{details(r)}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
