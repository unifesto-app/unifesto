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
} from "@phosphor-icons/react";
import {
  getEventById,
  createTicketType,
  deleteTicketType,
  type EventTicketType,
  type Event,
} from "@/lib/api/events-api";
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

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getEventById(eventId);
    if (error) setError(error.message);
    else setEvent(data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tickets = (event?.ticketTypes ?? []).filter(
    (t) => t.kind === "INDIVIDUAL" || t.kind === "GROUP"
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
          {tickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              onOpen={() => router.push(ticketHref(t.id))}
              onDuplicate={() => duplicate(t)}
              onDelete={() => remove(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRow({
  ticket,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  ticket: EventTicketType;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const price = Number(ticket.price);
  const isGroup = ticket.kind === "GROUP";
  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/40"
      onClick={onOpen}
    >
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{ticket.name}</span>
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
              ? `${ticket.soldCount}/${ticket.totalQuantity} sold`
              : `${ticket.soldCount} sold · unlimited`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            aria-label="Duplicate ticket"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
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
