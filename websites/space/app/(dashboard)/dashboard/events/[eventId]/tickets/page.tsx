"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Ticket,
  Plus,
  Trash,
  CaretRight,
  UsersThree,
  User,
  Copy,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeSlash,
} from "@phosphor-icons/react";
import {
  getManageTicketTypes,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  reorderTicketTypes,
  type EventTicketType,
  type ManagedTicketType,
} from "@/lib/api/events-api";
import {
  SALE_STATUS_META,
  isOffSale,
  ticketSaleStatus,
} from "@/components/events/ticket-status";
import {
  type Draft,
  EMPTY_DRAFT,
  TicketForm,
  toDraft,
  localToIso,
} from "@/components/events/ticket-editor";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function EventTicketsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  // Every tier of the event (incl. RSVP + hidden), in display order.
  const [allTickets, setAllTickets] = useState<ManagedTicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getManageTicketTypes(eventId);
    if (error) setError(error.message);
    else setAllTickets(data ?? []);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tickets = allTickets.filter(
    (t) => t.kind === "INDIVIDUAL" || t.kind === "GROUP"
  );

  const totals = tickets.reduce(
    (acc, t) => ({
      registrations: acc.registrations + t.stats.registrations,
      checkedIn: acc.checkedIn + t.stats.checkedIn,
      waitlist: acc.waitlist + t.stats.waitlistWaiting + t.stats.waitlistOffered,
      revenue:
        t.stats.revenue == null || acc.revenue == null
          ? null
          : acc.revenue + t.stats.revenue,
    }),
    { registrations: 0, checkedIn: 0, waitlist: 0, revenue: 0 as number | null }
  );

  const ticketHref = (id: string) =>
    `/dashboard/events/${eventId}/tickets/${id}`;

  const create = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("Ticket name is required.");
      return;
    }
    const price = Number(draft.price) || 0;
    const capacity = draft.capacity.trim() ? Number(draft.capacity) : undefined;
    const saleStartsAt = localToIso(draft.saleStartsAt);
    const saleEndsAt = localToIso(draft.saleEndsAt);
    if (saleStartsAt && saleEndsAt && saleEndsAt <= saleStartsAt) {
      setError("Sales end must be after sales start.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      kind: draft.kind,
      price,
      totalQuantity: capacity,
      saleStartsAt,
      saleEndsAt,
      perUserLimit: Number(draft.perUserLimit) || 1,
      // Only send the waiting list when there is a capacity for it to guard;
      // the API rejects the flag otherwise.
      ...(capacity && draft.waitlistEnabled
        ? {
            waitlistEnabled: true,
            waitlistOfferTtlHours: Number(draft.waitlistOfferTtlHours) || 24,
          }
        : {}),
      ...(draft.kind === "GROUP"
        ? {
            groupPricingMode: draft.groupPricingMode,
            minGroupSize: Number(draft.minGroupSize) || 1,
            maxGroupSize: Number(draft.maxGroupSize) || 1,
          }
        : {}),
    };

    setSaving(true);
    setError("");
    const { data, error } = await createTicketType(eventId, payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft(null);
    // Jump straight to the new ticket's detail page to add its custom form.
    if (data?.id) router.push(ticketHref(data.id));
    else await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this ticket type?")) return;
    const { error } = await deleteTicketType(eventId, id);
    if (error) setError(error.message);
    else await load();
  };

  // Hidden and paused both take a ticket off sale (the backend checks either
  // flag), so the one control flips both to keep them from drifting apart.
  const toggleVisible = async (t: ManagedTicketType) => {
    const next = isOffSale(t);
    setError("");
    const { error } = await updateTicketType(eventId, t.id, {
      isVisible: next,
      isActive: next,
    });
    if (error) setError(error.message);
    else await load();
  };

  // Swap with the neighbouring paid/free tier. Positions are swapped in the
  // full list so RSVP tiers (managed on their own tab) keep their slots.
  const move = async (t: ManagedTicketType, dir: -1 | 1) => {
    const i = tickets.findIndex((x) => x.id === t.id);
    const neighbour = tickets[i + dir];
    if (!neighbour) return;
    const next = [...allTickets];
    const a = next.findIndex((x) => x.id === t.id);
    const b = next.findIndex((x) => x.id === neighbour.id);
    [next[a], next[b]] = [next[b], next[a]];
    setAllTickets(next);
    const { error } = await reorderTicketTypes(
      eventId,
      next.map((x) => x.id)
    );
    if (error) {
      setError(error.message);
      await load();
    }
  };

  // Seed the create form from an existing ticket. The copy is a plain draft (no
  // id), so saving runs the normal create path — nothing is persisted until the
  // organiser reviews the prefilled form and hits "Create ticket".
  const duplicate = (t: EventTicketType) => {
    setError("");
    const copy = toDraft(t);
    delete copy.id;
    setDraft({ ...copy, name: `${copy.name} (copy)` });
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Paid or free tickets — individual or group, each with its own form"
        actions={
          !draft ? (
            <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>
              <Plus className="h-4 w-4" weight="bold" />
              Add ticket
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorNotice message={error} />}

      {tickets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sold" value={totals.registrations.toLocaleString("en-IN")} />
          <Stat label="Checked in" value={totals.checkedIn.toLocaleString("en-IN")} />
          <Stat label="On waiting list" value={totals.waitlist.toLocaleString("en-IN")} />
          {totals.revenue != null && (
            <Stat label="Net ticket revenue" value={formatInr(totals.revenue)} />
          )}
        </div>
      )}

      {draft && (
        <TicketForm
          title="New ticket"
          draft={draft}
          setDraft={setDraft}
          onSave={create}
          onCancel={() => {
            setDraft(null);
            setError("");
          }}
          saving={saving}
          saveLabel="Create ticket"
        />
      )}

      {tickets.length === 0 && !draft ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Ticket}
              title="No ticket types yet"
              description="Create individual or group tickets — free or paid. For one-click free entry, use the RSVPs tab instead."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t, i) => (
            <TicketRow
              key={t.id}
              ticket={t}
              isFirst={i === 0}
              isLast={i === tickets.length - 1}
              onOpen={() => router.push(ticketHref(t.id))}
              onMove={(dir) => move(t, dir)}
              onToggleVisible={() => toggleVisible(t)}
              onDuplicate={() => duplicate(t)}
              onDelete={() => remove(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function TicketRow({
  ticket,
  isFirst,
  isLast,
  onOpen,
  onMove,
  onToggleVisible,
  onDuplicate,
  onDelete,
}: {
  ticket: ManagedTicketType;
  isFirst: boolean;
  isLast: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const price = Number(ticket.price);
  const isGroup = ticket.kind === "GROUP";
  const status = SALE_STATUS_META[ticketSaleStatus(ticket)];
  const offSale = isOffSale(ticket);
  const { stats } = ticket;
  const waitlist = stats.waitlistWaiting + stats.waitlistOffered;
  const pct =
    ticket.totalQuantity != null && ticket.totalQuantity > 0
      ? Math.min(100, Math.round((ticket.soldCount / ticket.totalQuantity) * 100))
      : null;

  const stop =
    (fn: () => void) =>
    (e: React.MouseEvent) => {
      e.stopPropagation();
      fn();
    };

  return (
    <Card
      className={`cursor-pointer transition-colors hover:border-primary/40 ${
        offSale ? "opacity-70" : ""
      }`}
      onClick={onOpen}
    >
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="flex shrink-0 flex-col">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            disabled={isFirst}
            onClick={stop(() => onMove(-1))}
            aria-label="Move up"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1"
            disabled={isLast}
            onClick={stop(() => onMove(1))}
            aria-label="Move down"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{ticket.name}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant={isGroup ? "brand" : "neutral"}>
              {isGroup ? (
                <UsersThree className="mr-1 h-3 w-3" />
              ) : (
                <User className="mr-1 h-3 w-3" />
              )}
              {isGroup ? "Group" : "Individual"}
            </Badge>
            {price === 0 && <Badge variant="success">Free</Badge>}
          </div>
          {ticket.description && (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
              {ticket.description}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {price > 0
              ? `₹${price.toLocaleString("en-IN")}${
                  isGroup
                    ? ticket.groupPricingMode === "PER_PERSON"
                      ? " / person"
                      : " / group"
                    : ""
                }`
              : "Free"}
            {isGroup && ` · ${ticket.minGroupSize}–${ticket.maxGroupSize} people`}
            {" · "}
            {ticket.totalQuantity != null
              ? `${ticket.soldCount}/${ticket.totalQuantity} seats taken`
              : `${ticket.soldCount} seats taken · unlimited`}
            {` · ${stats.checkedIn} checked in`}
            {waitlist > 0 && ` · ${waitlist} on waiting list`}
            {stats.revenue != null && stats.revenue > 0 && ` · ${formatInr(stats.revenue)} net`}
          </p>
          {pct != null && (
            <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={stop(onToggleVisible)}
            aria-label={offSale ? "Put ticket on sale" : "Hide ticket"}
            title={offSale ? "Put on sale" : "Hide from the event page"}
          >
            {offSale ? (
              <EyeSlash className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={stop(onDuplicate)}
            aria-label="Duplicate ticket"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={stop(onDelete)}
            aria-label="Delete ticket"
          >
            <Trash className="h-4 w-4 text-destructive" />
          </Button>
          <CaretRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
