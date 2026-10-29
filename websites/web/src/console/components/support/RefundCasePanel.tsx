"use client";

import { useState } from "react";
import { inr } from "@/console/lib/utils/money";
import { curatorReviewRefund, type RefundRequest } from "@/console/lib/api/refunds-api";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Textarea } from "@/console/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";

const STATUS: Record<RefundRequest["status"], string> = {
  PENDING_CURATOR: "Needs my review",
  PENDING_ADMIN: "With Unifesto",
  PROCESSING: "Refunding",
  APPROVED: "Refunded",
  REJECTED: "Declined",
  REFUND_FAILED: "With Unifesto",
};

/**
 * D6: the refund behind a case. The space reviews it first: forward it to
 * Unifesto to decide, or decline it with a reason. Unifesto moves the money.
 */
export function RefundCasePanel({ refund, onDone }: { refund: RefundRequest; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"FORWARD" | "REJECT" | null>(null);
  const [error, setError] = useState("");
  const pending = refund.status === "PENDING_CURATOR";

  const review = async (action: "FORWARD" | "REJECT") => {
    if (action === "REJECT" && !note.trim()) {
      setError("Add a reason to decline.");
      return;
    }
    setBusy(action);
    setError("");
    const { error } = await curatorReviewRefund(refund.id, { action, note: note.trim() || undefined });
    setBusy(null);
    if (error) setError(error.message || "Could not save the review.");
    else {
      setNote("");
      onDone();
    }
  };

  const rows: [string, string | null][] = [
    ["Reason", refund.reason],
    ["Asked for", refund.requestedAmount ? inr(refund.requestedAmount) : "Full ticket price"],
    ["Refunded", refund.approvedAmount ? inr(refund.approvedAmount) : null],
    ["My note", refund.curatorNote],
    ["Unifesto's note", refund.adminNote],
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Refund request</CardTitle>
        <Badge variant={pending ? "warning" : "neutral"}>{STATUS[refund.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-foreground">{v}</dd>
              </div>
            ))}
        </dl>
        {error && <ErrorNotice message={error} />}
        {pending && (
          <div className="space-y-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note (needed to decline)"
              aria-label="Refund review note"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => review("FORWARD")}>
                {busy === "FORWARD" ? "Sending…" : "Send to Unifesto to refund"}
              </Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => review("REJECT")}>
                {busy === "REJECT" ? "Declining…" : "Decline"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
