"use client";

import Link from "next/link";
import { inr } from "@/lib/utils/money";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CaretRight as CaretRightIcon,
  CheckCircle,
  Plus,
  Users,
  UploadSimple,
  WhatsappLogo,
} from "@unifesto/unicon/react";
import { getEventById } from "@/lib/api/events-api";
import {
  getEventRegistrations,
  exportRegistrations,
  sendWhatsappGroupInvite,
  bulkCheckin,
  EXPORT_EXTENSION,
  REGISTRATION_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/api/registrations-api";
import { ExportMenu } from "@/components/shared/ExportMenu";
import {
  getManageTicketTypes,
  type Event,
  type EventTicketType,
} from "@/lib/api/events-api";
import type {
  Registration,
  RegistrationStatus,
  PaymentStatus,
  ExportFormat,
} from "@/lib/api/registrations-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAccess } from "@/lib/context/SessionContext";
import { PrintBadgesDialog } from "./PrintBadgesDialog";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ITEMS_PER_PAGE = 20;

function initials(name?: string | null, username?: string | null): string {
  const text = name || username || "?";
  return text.substring(0, 2).toUpperCase();
}

export default function EventRegistrationsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const searchParams = useSearchParams();
  const { can } = useAccess(eventId);

  const [event, setEvent] = useState<Event | null>(null);
  // Operator ticket list (incl. hidden tiers) for the filter; the public event
  // payload drops hidden tickets, whose holders still need to be findable.
  const [ticketTypes, setTicketTypes] = useState<EventTicketType[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | "all">("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatus | "all">("all");
  // `?ticket=<id>` deep-links from a ticket page straight to its holders.
  const [ticketFilter, setTicketFilter] = useState<string>(
    () => searchParams.get("ticket") ?? "all"
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkingIn, setCheckingIn] = useState(false);
  // Whether this space's plan includes bulk export (the flag the backend
  // enforces with). `undefined` until access loads; ExportMenu stays live then.
  const exportAccess = useAccess(eventId);
  const canExport = exportAccess.access ? exportAccess.hasFeature("hasBulkExport") : undefined;

  const loadEvent = useCallback(async () => {
    const [{ data }, { data: tiers }] = await Promise.all([
      getEventById(eventId),
      getManageTicketTypes(eventId),
    ]);
    if (!data) return;
    setEvent(data);
    setTicketTypes(tiers ?? data.ticketTypes ?? []);
  }, [eventId]);

  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getEventRegistrations(eventId, {
      page,
      limit: ITEMS_PER_PAGE,
      search: search || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      paymentStatus: paymentFilter === "all" ? undefined : paymentFilter,
      ticketTypeId: ticketFilter === "all" ? undefined : ticketFilter,
      // Default to confirmed attendees only, so the count matches the
      // "No. of attendees" tile. Picking an explicit Status/Payment filter
      // overrides this on the backend, so Cancelled/Failed stay viewable.
      attendingOnly: true,
    });
    if (error) {
      setError(error.message);
    } else if (data) {
      setRegistrations(data.registrations);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  }, [eventId, page, search, statusFilter, paymentFilter, ticketFilter]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, statusFilter, paymentFilter, ticketFilter]);

  const canCheckIn = (reg: Registration) =>
    !reg.checkedInAt && reg.status !== "CANCELLED";
  const checkable = registrations.filter(canCheckIn);
  const allOnPageSelected =
    checkable.length > 0 && checkable.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of checkable) {
        if (allOnPageSelected) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  const handleBulkCheckin = async () => {
    const n = selected.size;
    if (!window.confirm(`Check in ${n} ${n === 1 ? "attendee" : "attendees"}?`)) return;
    setCheckingIn(true);
    const { data, error } = await bulkCheckin(eventId, [...selected]);
    setCheckingIn(false);
    if (error) {
      alert(error.message);
      return;
    }
    if (data) {
      const parts = [`Checked in ${data.success.length}`];
      if (data.alreadyCheckedIn.length > 0)
        parts.push(`${data.alreadyCheckedIn.length} already in`);
      if (data.failed.length > 0)
        parts.push(
          `${data.failed.length} failed (${[...new Set(data.failed.map((f) => f.reason))].join(", ")})`
        );
      alert(parts.join(" · ") + ".");
    }
    setSelected(new Set());
    await loadRegistrations();
  };

  const handleExport = async (format: ExportFormat) => {
    setExporting(true);
    const { data, error } = await exportRegistrations(eventId, format);
    if (error) {
      alert(error.message);
    } else if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${event?.slug || eventId}-attendees.${EXPORT_EXTENSION[format]}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  };

  const handleSendWhatsappInvite = async () => {
    // Sending WhatsApp messages to real attendees is outward-facing, so confirm
    // before firing. Only those not yet invited / not self-marked joined receive it.
    if (
      !window.confirm(
        "Send the WhatsApp group invite to confirmed attendees who haven't been invited or already joined?"
      )
    ) {
      return;
    }
    setSendingInvite(true);
    const { data, error } = await sendWhatsappGroupInvite(eventId);
    if (error) {
      alert(error.message);
    } else if (data) {
      const parts = [`Sent ${data.sent} invite${data.sent === 1 ? "" : "s"}`];
      if (data.noPhone > 0) parts.push(`${data.noPhone} without a phone number`);
      if (data.noLink > 0) parts.push(`${data.noLink} with no group link`);
      if (data.failed > 0) parts.push(`${data.failed} failed`);
      alert(
        data.eligible === 0
          ? "Everyone has already been invited or has joined — nothing to send."
          : parts.join(" · ") + "."
      );
    }
    setSendingInvite(false);
  };

  const statusBadgeVariant = (status: RegistrationStatus) => {
    switch (status) {
      case "ATTENDED":
        return "success";
      case "CANCELLED":
        return "destructive";
      default:
        return "neutral";
    }
  };

  const paymentBadgeVariant = (status: PaymentStatus) => {
    switch (status) {
      case "PAID":
        return "success";
      case "FAILED":
      case "REFUNDED":
        return "destructive";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendees"
        subtitle={
          loading
            ? "Loading..."
            : `${total.toLocaleString("en-IN")} ${total === 1 ? "registration" : "registrations"}`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSendWhatsappInvite}
            disabled={sendingInvite}
            title="Send the WhatsApp group invite to attendees who haven't been invited or joined"
          >
            <WhatsappLogo className="h-4 w-4" />
            {sendingInvite ? "Sending..." : "WhatsApp invite"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/dashboard/events/${eventId}/attendees/import`)
            }
          >
            <UploadSimple className="h-4 w-4" />
            Import
          </Button>
          <Button
            onClick={() =>
              router.push(`/dashboard/events/${eventId}/attendees/add`)
            }
          >
            <Plus className="h-4 w-4" />
            Add attendee
          </Button>
          {can("event:manage-attendees") && (
            <PrintBadgesDialog
              eventId={eventId}
              eventSlug={event?.slug}
              selectedIds={[...selected]}
              filters={{
                ticketTypeId: ticketFilter === "all" ? undefined : ticketFilter,
                status: statusFilter === "all" ? undefined : statusFilter,
                search: search.trim() || undefined,
                filtered:
                  !!search.trim() || statusFilter !== "all" || paymentFilter !== "all" || ticketFilter !== "all",
              }}
            />
          )}
          <ExportMenu
            onExport={handleExport}
            exporting={exporting}
            disabled={total === 0}
            canExport={canExport}
          />
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or team member"
            className="pl-9"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as RegistrationStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="REGISTERED">Registered</SelectItem>
            <SelectItem value="ATTENDED">Checked in</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={paymentFilter}
          onValueChange={(v) => setPaymentFilter(v as PaymentStatus | "all")}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All payments</SelectItem>
            <SelectItem value="PAID">Paid</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="REFUNDED">Refunded</SelectItem>
          </SelectContent>
        </Select>
        {ticketTypes.length > 0 && (
          <Select value={ticketFilter} onValueChange={setTicketFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ticket types</SelectItem>
              {ticketTypes.map((tt) => (
                <SelectItem key={tt.id} value={tt.id}>
                  {tt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && <ErrorNotice message={error} />}

      {!loading && checkable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={allOnPageSelected}
              onChange={togglePage}
            />
            Select all on this page
          </label>
          {selected.size > 0 && (
            <Button size="sm" onClick={handleBulkCheckin} disabled={checkingIn}>
              <CheckCircle className="h-4 w-4" />
              {checkingIn ? "Checking in..." : `Check in ${selected.size}`}
            </Button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            {search ||
            statusFilter !== "all" ||
            paymentFilter !== "all" ||
            ticketFilter !== "all" ? (
              <EmptyState
                icon={Users}
                title="No registrations match"
                description="Try a different search, or clear the filters."
              />
            ) : (
              <EmptyState
                icon={Users}
                tone="positive"
                title="No registrations yet"
                description="People show up here as soon as they register. Share the event link to get started."
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {registrations.map((reg) => (
                  // The name is the link (keyboard + screen readers); clicking
                  // anywhere else on the row is a mouse shortcut to the same page.
                  <div
                    key={reg.id}
                    onClick={() =>
                      router.push(
                        `/dashboard/events/${eventId}/attendees/${reg.id}`
                      )
                    }
                    className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/50 focus-within:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      {checkable.length > 0 && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${reg.user.fullName || reg.user.username || "attendee"}`}
                          className="h-4 w-4 flex-shrink-0 accent-primary disabled:invisible"
                          disabled={!canCheckIn(reg)}
                          checked={selected.has(reg.id)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onChange={() => toggle(reg.id)}
                        />
                      )}
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {reg.user.avatarUrl ? (
                          <img
                            src={reg.user.avatarUrl}
                            alt=""
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          initials(reg.user.fullName, reg.user.username)
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          <Link
                            href={`/dashboard/events/${eventId}/attendees/${reg.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline focus-visible:underline focus-visible:outline-none"
                          >
                            {reg.user.fullName || reg.user.username || "Unknown"}
                          </Link>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {reg.user.email || reg.user.username}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {new Date(reg.registeredAt).toLocaleDateString("en-IN")}
                          </span>
                          {reg.ticketType && (
                            <Badge variant="outline" className="text-xs">
                              {reg.ticketType.name}
                            </Badge>
                          )}
                          {reg.groupSize && reg.groupSize > 1 && (
                            <Badge variant="neutral" className="text-xs">
                              Group of {reg.groupSize}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Badge variant={statusBadgeVariant(reg.status)}>
                        {REGISTRATION_STATUS_LABEL[reg.status] ?? reg.status}
                      </Badge>
                      <Badge variant={paymentBadgeVariant(reg.paymentStatus)}>
                        {PAYMENT_STATUS_LABEL[reg.paymentStatus] ?? reg.paymentStatus}
                      </Badge>
                      {/* The status badge already says "Checked in" for ATTENDED. */}
                      {reg.checkedInAt && reg.status !== "ATTENDED" && (
                        <div className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="h-3 w-3" weight="fill" />
                          Checked in
                        </div>
                      )}
                      {reg.totalAmount > 0 && (
                        <span className="text-sm font-medium">
                          {inr(reg.totalAmount)}
                        </span>
                      )}
                      <CaretRightIcon className="hidden h-4 w-4 flex-shrink-0 text-muted-foreground sm:block" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <CaretLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <CaretRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
