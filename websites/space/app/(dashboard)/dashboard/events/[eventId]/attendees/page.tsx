"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
  CaretRight as CaretRightIcon,
  CheckCircle,
  Plus,
  UploadSimple,
  WhatsappLogo,
} from "@unifesto/unicon/react";
import { getEventById } from "@/lib/api/events-api";
import {
  getEventRegistrations,
  exportRegistrations,
  sendWhatsappGroupInvite,
  EXPORT_EXTENSION,
} from "@/lib/api/registrations-api";
import { getSpaceUsage } from "@/lib/api/subscriptions-api";
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
  // Whether this space's plan includes bulk export. `undefined` until the
  // space's plan resolves; the ExportMenu keeps the button live meanwhile.
  const [canExport, setCanExport] = useState<boolean | undefined>(undefined);

  const loadEvent = useCallback(async () => {
    const [{ data }, { data: tiers }] = await Promise.all([
      getEventById(eventId),
      getManageTicketTypes(eventId),
    ]);
    if (!data) return;
    setEvent(data);
    setTicketTypes(tiers ?? data.ticketTypes ?? []);
    // Gate the Export control on the space's effective plan, using the same
    // flag the backend enforces with (getEffectiveLimits → hasBulkExport).
    const { data: usage } = await getSpaceUsage(data.spaceId);
    if (usage) setCanExport(usage.features.hasBulkExport);
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
  }, [search, statusFilter, paymentFilter, ticketFilter]);

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
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/dashboard/events/${eventId}`)}
          className="-ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>

      <PageHeader
        title="Attendees"
        subtitle={
          loading
            ? "Loading..."
            : `${total.toLocaleString("en-IN")} ${total === 1 ? "registration" : "registrations"}`
        }
        actions={
          <div className="flex items-center gap-2">
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
            <SelectItem value="ATTENDED">Attended</SelectItem>
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

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : registrations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">No registrations found</p>
            <p className="text-sm text-muted-foreground">
              {search ||
              statusFilter !== "all" ||
              paymentFilter !== "all" ||
              ticketFilter !== "all"
                ? "Try adjusting your filters"
                : "Registrations will appear here once people sign up"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {registrations.map((reg) => (
                  <div
                    key={reg.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(
                        `/dashboard/events/${eventId}/attendees/${reg.id}`
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(
                          `/dashboard/events/${eventId}/attendees/${reg.id}`
                        );
                      }
                    }}
                    className="flex cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
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
                          {reg.user.fullName || reg.user.username || "Unknown"}
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
                        {reg.status}
                      </Badge>
                      <Badge variant={paymentBadgeVariant(reg.paymentStatus)}>
                        {reg.paymentStatus}
                      </Badge>
                      {reg.checkedInAt && (
                        <div className="flex items-center gap-1 text-xs text-success">
                          <CheckCircle className="h-3 w-3" weight="fill" />
                          Checked in
                        </div>
                      )}
                      {reg.totalAmount > 0 && (
                        <span className="text-sm font-medium">
                          ₹{Number(reg.totalAmount).toLocaleString("en-IN")}
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
