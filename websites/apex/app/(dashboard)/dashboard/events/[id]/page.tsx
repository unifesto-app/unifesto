"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Buildings,
  CalendarBlank,
  MapPin,
  VideoCamera,
  Ticket,
  Stack,
  Copy,
  UsersThree,
  CurrencyInr,
  Phone,
  Envelope,
} from "@unifesto/unicon/react";
import {
  getEventAdmin,
  publishEventAdmin,
  cancelEventAdmin,
  hideEventAdmin,
  restoreEventAdmin,
  type AdminEventDetail,
  type AdminEventStatus,
} from "@/lib/api/admin-events-api";
import { refundCancelledEvent } from "@/lib/api/refunds-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/shared/StatCard";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { inr } from "@/lib/utils/money";

const money = inr;
const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

const STATUS: Record<AdminEventStatus, { label: string; variant: "success" | "neutral" | "warning" | "destructive" | "brand" }> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  PUBLISHED: { label: "Published", variant: "success" },
  ONGOING: { label: "Ongoing", variant: "brand" },
  COMPLETED: { label: "Completed", variant: "neutral" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

const PAYMENT_VARIANT: Record<string, "success" | "neutral" | "warning" | "destructive"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "destructive",
  REFUNDED: "destructive",
  PARTIALLY_REFUNDED: "warning",
};

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      title="Copy ID"
    >
      {copied ? "Copied!" : id}
      <Copy className="h-3 w-3" />
    </button>
  );
}

export default function AdminEventDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [event, setEvent] = useState<AdminEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Moderation
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundNotice, setRefundNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getEventAdmin(id);
    if (error) setError(error.message);
    else if (data) setEvent(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // Run a moderation action, then refresh the event so the page reflects the
  // new status (and which actions are now available) from the source of truth.
  const runAction = useCallback(
    async (fn: () => Promise<{ error: { message: string } | null }>) => {
      setActing(true);
      setActionError("");
      const { error } = await fn();
      setActing(false);
      if (error) {
        setActionError(error.message);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  const onCancel = useCallback(async () => {
    if (!cancelReason.trim()) return;
    const ok = await runAction(() => cancelEventAdmin(id, cancelReason.trim()));
    if (ok) {
      setCancelOpen(false);
      setCancelReason("");
    }
  }, [cancelReason, id, runAction]);

  // A cancelled event owes its paid attendees: send them all at once.
  const onRefundAll = useCallback(async () => {
    if (!window.confirm("Refund every paid attendee? Ticket prices and online stays go back now. The processing fee is kept.")) return;
    setActing(true);
    setActionError("");
    setRefundNotice("");
    const { data, error } = await refundCancelledEvent(id);
    setActing(false);
    if (error) {
      setActionError(error.message);
      return;
    }
    if (data) {
      const sent = `${data.refunded} ticket and ${data.staysRefunded} stay refunds sent.`;
      setRefundNotice(
        data.failed.length
          ? `${sent} ${data.failed.length} failed: ${data.failed.map((f) => f.error).join("; ")}. Run it again to retry.`
          : sent
      );
    }
    await load();
  }, [id, load]);

  const net = event ? event.sales.grossSales - event.sales.refunded : 0;
  const isOnline = event ? ["ONLINE", "HYBRID"].includes(event.type) : false;
  const isInPerson = event ? ["IN_PERSON", "HYBRID"].includes(event.type) : false;

  // Which moderation actions apply, mirroring the backend's own state rules.
  const canPublish = event?.status === "DRAFT" && !event.deletedAt;
  const canCancel =
    !!event &&
    !event.deletedAt &&
    ["PUBLISHED", "ONGOING"].includes(event.status);
  const canHide =
    !!event &&
    !event.deletedAt &&
    ["COMPLETED", "CANCELLED"].includes(event.status);
  const canRestore = !!event?.deletedAt;
  const canRefundAll = event?.status === "CANCELLED";
  const hasActions = canPublish || canCancel || canHide || canRestore || canRefundAll;

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/dashboard/events")}
        className="-ml-2 gap-1.5 text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to events
      </Button>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <div className="space-y-3">
          <ErrorNotice message={error} />
          <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      ) : event ? (
        <>
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {event.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.coverImageUrl}
                alt={event.title}
                className="h-24 w-40 flex-shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-24 w-40 flex-shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <CalendarBlank className="h-8 w-8" weight="duotone" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{event.title}</h1>
                <Badge variant={STATUS[event.status].variant}>{STATUS[event.status].label}</Badge>
                {event.deletedAt && <Badge variant="destructive">Hidden</Badge>}
                {(event._count?.childEvents ?? 0) > 0 && (
                  <Badge variant="brand">
                    <Stack className="mr-1 h-3 w-3" weight="fill" />
                    Big event · {event._count.childEvents}
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono">/{event.slug}</span> · Created {fmtDate(event.createdAt)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>Event ID:</span> <CopyId id={event.id} />
              </div>
              {event.parentEvent && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sub-event of{" "}
                  <Link href={`/dashboard/events/${event.parentEvent.id}`} className="font-medium text-foreground hover:underline">
                    {event.parentEvent.title}
                  </Link>
                </p>
              )}
              {event.status === "CANCELLED" && event.cancellationReason && (
                <p className="mt-2 text-xs text-destructive">
                  Cancelled: {event.cancellationReason}
                </p>
              )}
            </div>

            {/* Moderation actions */}
            {hasActions && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {canPublish && (
                  <Button size="sm" disabled={acting} onClick={() => window.confirm(`Publish "${event.title}"? It goes live to everyone.`) && void runAction(() => publishEventAdmin(event.id))}>
                    Publish
                  </Button>
                )}
                {canCancel && (
                  <Button variant="destructive" size="sm" disabled={acting} onClick={() => { setActionError(""); setCancelOpen(true); }}>
                    Cancel event
                  </Button>
                )}
                {canRefundAll && (
                  <Button size="sm" disabled={acting} onClick={() => void onRefundAll()}>
                    Refund all paid
                  </Button>
                )}
                {canHide && (
                  <Button variant="outline" size="sm" disabled={acting} onClick={() => window.confirm(`Hide "${event.title}"? It disappears from public listings.`) && void runAction(() => hideEventAdmin(event.id))}>
                    Hide
                  </Button>
                )}
                {canRestore && (
                  <Button variant="outline" size="sm" disabled={acting} onClick={() => void runAction(() => restoreEventAdmin(event.id))}>
                    Restore
                  </Button>
                )}
              </div>
            )}
          </div>

          {actionError && !cancelOpen && <ErrorNotice message={actionError} />}
          {refundNotice && <p className="text-sm text-muted-foreground">{refundNotice}</p>}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard title="Registered" value={event.registeredCount.toLocaleString("en-IN")} icon={UsersThree} />
            <StatCard title="Confirmed attendees" value={event.attendeeCount.toLocaleString("en-IN")} hint={`${event.sales.paidRegistrations} paid regs`} icon={Ticket} />
            <StatCard title="Gross sales" value={money(event.sales.grossSales)} hint={`${money(event.sales.processingFees)} fees`} icon={CurrencyInr} tone="success" />
            <StatCard title="Net (after refunds)" value={money(net)} hint={`${money(event.sales.refunded)} refunded`} icon={CurrencyInr} />
          </div>

          {/* Curator · Space · Schedule · Location */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Curator</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-foreground">
                    {event.creator.fullName || event.creator.username || "Curator"}
                  </span>
                </div>
                {event.creator.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Envelope className="h-4 w-4 flex-shrink-0" /> {event.creator.email}
                  </div>
                )}
                {event.creator.mobileNumber && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" /> {event.creator.mobileNumber}
                  </div>
                )}
                <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                  Curator ID: <CopyId id={event.creator.id} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Space</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-2 text-sm">
                <div className="flex items-center gap-2">
                  <Buildings className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-foreground">{event.space?.name ?? "—"}</span>
                </div>
                {event.space && (
                  <p className="font-mono text-xs text-muted-foreground">/{event.space.slug}</p>
                )}
                {event.category && (
                  <p className="text-xs text-muted-foreground">Category: {event.category}</p>
                )}
                {event.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {event.tags.map((t) => (
                      <span key={t} className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-2 text-sm">
                <div className="flex items-start gap-2">
                  <CalendarBlank className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-foreground">{fmtDateTime(event.startDateTime)}</p>
                    <p className="text-muted-foreground">to {fmtDateTime(event.endDateTime)}</p>
                    <p className="text-xs text-muted-foreground">{event.timezone}</p>
                  </div>
                </div>
                {event.capacity != null && (
                  <p className="text-xs text-muted-foreground">
                    Capacity: {event.capacity.toLocaleString("en-IN")}
                    {event.waitlistEnabled ? ` · waitlist ${event.waitlistCount}` : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Location</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-2 text-sm">
                {isInPerson && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-foreground">{event.venueName || "—"}</p>
                      <p className="text-muted-foreground">
                        {[event.venueAddress, event.city, event.state, event.country].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                )}
                {isOnline && (
                  <div className="flex items-start gap-2">
                    <VideoCamera className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-foreground">{event.onlinePlatform || "Online"}</p>
                      {event.onlineUrl && (
                        <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-primary hover:underline">
                          {event.onlineUrl}
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {event.description && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Description</CardTitle></CardHeader>
              <CardContent className="pt-2">
                <p className="whitespace-pre-wrap text-sm text-foreground">{event.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Ticket types */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Ticket types ({event.ticketTypes.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {event.ticketTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ticket types.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Name</th>
                        <th className="py-2 pr-4 font-medium">Kind</th>
                        <th className="py-2 pr-4 text-right font-medium">Price</th>
                        <th className="py-2 pr-4 text-right font-medium">Sold</th>
                        <th className="py-2 pr-4 text-right font-medium">Paid regs</th>
                        <th className="py-2 text-right font-medium">Gross</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.ticketTypes.map((t) => (
                        <tr key={t.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2.5 pr-4 font-medium text-foreground">{t.name}</td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{t.kind.replace(/_/g, " ").toLowerCase()}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                            {Number(t.price) === 0 ? "Free" : money(t.price)}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                            {t.soldCount}{t.quantity != null ? ` / ${t.quantity}` : ""}
                          </td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{t.sales.paidRegistrations}</td>
                          <td className="py-2.5 text-right tabular-nums text-foreground">{money(t.sales.grossSales)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sub-events */}
          {event.childEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Sub-events ({event.childEvents.length})</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Title</th>
                        <th className="py-2 pr-4 font-medium">Status</th>
                        <th className="py-2 pr-4 text-right font-medium">Registered</th>
                        <th className="py-2 font-medium">Starts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.childEvents.map((c) => (
                        <tr key={c.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
                          <td className="py-2.5 pr-4">
                            <Link href={`/dashboard/events/${c.id}`} className="font-medium text-foreground hover:underline">
                              {c.title}
                            </Link>
                          </td>
                          <td className="py-2.5 pr-4"><Badge variant={STATUS[c.status].variant}>{STATUS[c.status].label}</Badge></td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{c.registeredCount.toLocaleString("en-IN")}</td>
                          <td className="py-2.5 text-muted-foreground">{fmtDate(c.startDateTime)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent registrations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recent registrations</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {event.recentRegistrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No registrations yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Attendee</th>
                        <th className="py-2 pr-4 font-medium">Ticket</th>
                        <th className="py-2 pr-4 text-right font-medium">Qty</th>
                        <th className="py-2 pr-4 text-right font-medium">Amount</th>
                        <th className="py-2 pr-4 font-medium">Payment</th>
                        <th className="py-2 font-medium">Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {event.recentRegistrations.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <td className="py-2.5 pr-4 text-foreground">
                            {r.user.fullName || (r.user.username ? `@${r.user.username}` : "—")}
                          </td>
                          <td className="py-2.5 pr-4 text-muted-foreground">{r.ticketType?.name ?? "—"}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">{r.quantity}</td>
                          <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                            {money(r.totalAmount)}
                            {Number(r.refundedAmount) > 0 && (
                              <span className="ml-1 text-xs text-destructive">−{money(r.refundedAmount)}</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4">
                            <Badge variant={PAYMENT_VARIANT[r.paymentStatus] ?? "neutral"}>
                              {r.paymentStatus.replace(/_/g, " ").toLowerCase()}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{fmtDate(r.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cancel dialog — reason is required and goes to attendees. */}
          <Dialog open={cancelOpen} onOpenChange={(o) => !acting && setCancelOpen(o)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel this event?</DialogTitle>
                <DialogDescription>
                  This sets the event and its sub-events to Cancelled and emails all
                  registered attendees. Every paid ticket gets a refund request for its
                  ticket price (the processing fee is kept), and payouts stop until they
                  are sent. Use Refund all paid to send them. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <label htmlFor="cancel-reason" className="text-sm font-medium text-foreground">
                  Reason
                </label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  placeholder="Shared with attendees, e.g. venue became unavailable."
                />
                {actionError && <p className="text-sm text-destructive">{actionError}</p>}
              </div>
              <DialogFooter>
                <Button variant="ghost" size="sm" disabled={acting} onClick={() => setCancelOpen(false)}>
                  Keep event
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={acting || !cancelReason.trim()}
                  onClick={() => void onCancel()}
                >
                  {acting ? "Cancelling…" : "Cancel event"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Skeleton className="h-24 w-40 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
