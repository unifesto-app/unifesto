import { Badge, type BadgeProps } from "@/components/ui/badge";

/**
 * Maps common lifecycle statuses (events, transactions, payouts, tickets…) to
 * a Badge variant so colour carries meaning consistently across the app.
 * Green means done/earned, amber means waiting, red means failed/blocked.
 */
const STATUS_VARIANT: Record<string, BadgeProps["variant"]> = {
  // positive / complete
  paid: "success",
  succeeded: "success",
  settled: "success",
  completed: "success",
  approved: "success",
  published: "success",
  active: "success",
  resolved: "success",
  verified: "success",
  sent: "success",
  // in progress / waiting
  pending: "warning",
  processing: "warning",
  sending: "brand",
  ongoing: "brand",
  draft: "warning",
  scheduled: "warning",
  open: "warning",
  in_review: "warning",
  requested: "warning",
  // negative / stopped
  failed: "destructive",
  rejected: "destructive",
  cancelled: "destructive",
  refunded: "destructive",
  disputed: "destructive",
  closed: "neutral",
};

function labelFor(status: string): string {
  return status.replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  const variant = STATUS_VARIANT[key] ?? "neutral";
  return (
    <Badge variant={variant} className="capitalize">
      {labelFor(key)}
    </Badge>
  );
}
