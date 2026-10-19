"use client";

import { useState } from "react";
import { inr } from "@/lib/utils/money";
import { cancelStayBooking } from "@/lib/api/stays";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** The stay booking behind a case, as `GET /support/tickets/:id` returns it (raw row). */
export interface StayCaseBooking {
  id: string;
  eventId: string;
  status: string;
  paymentMode: string;
  paymentStatus: string;
  totalAmount: string;
  processingFee: string;
  refundedAmount: string;
  cancellationReason: string | null;
}

const OPEN = ["PENDING", "AWAITING_PAYMENT", "CONFIRMED"];

/**
 * D23: a guest asked to cancel a stay they paid for online. The event team
 * cancels it here and the stay price goes back (the processing fee is kept),
 * the same refund the stay bookings page sends.
 */
export function StayCasePanel({ booking, onDone }: { booking: StayCaseBooking; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancellable = OPEN.includes(booking.status);
  const paidOnline = booking.paymentMode === "ONLINE" && booking.paymentStatus === "PAID";
  const refund = Number(booking.totalAmount) - Number(booking.processingFee);

  const cancel = async () => {
    if (!window.confirm(paidOnline ? `Cancel this stay and refund ${inr(refund)}?` : "Cancel this stay?")) return;
    setBusy(true);
    setError("");
    const res = await cancelStayBooking(booking.eventId, booking.id, {
      reason: reason.trim() || undefined,
      refund: paidOnline,
    });
    setBusy(false);
    if (!res.ok) setError(res.message);
    else onDone();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">Stay booking</CardTitle>
        <Badge variant={cancellable ? "warning" : "neutral"}>{booking.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd className="text-foreground">{paidOnline ? `${inr(booking.totalAmount)} online` : "Not paid online"}</dd>
          </div>
          {Number(booking.refundedAmount) > 0 && (
            <div>
              <dt className="text-xs text-muted-foreground">Refunded</dt>
              <dd className="text-foreground">{inr(booking.refundedAmount)}</dd>
            </div>
          )}
          {booking.cancellationReason && (
            <div>
              <dt className="text-xs text-muted-foreground">Cancelled</dt>
              <dd className="whitespace-pre-wrap break-words text-foreground">{booking.cancellationReason}</dd>
            </div>
          )}
        </dl>
        {error && <ErrorNotice message={error} />}
        {cancellable && (
          <div className="space-y-2">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Reason (sent to the guest)"
              aria-label="Stay cancellation reason"
            />
            <Button size="sm" disabled={busy} onClick={cancel}>
              {busy ? "Cancelling…" : paidOnline ? `Cancel and refund ${inr(refund)}` : "Cancel stay"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
