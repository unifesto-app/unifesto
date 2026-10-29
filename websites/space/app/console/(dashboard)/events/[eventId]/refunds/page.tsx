"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { RefundsPanel } from "@/console/components/finance/RefundsPanel";

/** This event's refund requests: review, forward or reject (B15, mobile parity). */
export default function EventRefundsPage() {
  const eventId = useParams().eventId as string;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        subtitle="Requests for this event. Forward the ones you've checked to Unifesto, who sends the money back."
      />
      <RefundsPanel eventId={eventId} />
    </div>
  );
}
