"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, UsersThree, User, CheckCircle } from "@phosphor-icons/react";
import {
  getEventById,
  updateTicketType,
  type EventTicketType,
  type Event,
} from "@/lib/api/events-api";
import {
  type Draft,
  toDraft,
  TicketForm,
  FormFieldsManager,
  DEFAULT_FIELDS,
  localToIso,
} from "@/components/events/ticket-editor";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const ticketId = params.ticketId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Ids of ticket types this ticket blocks (holders of this ticket can't
  // register for them). Initialised from the server, edited before "Save".
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [savingBlocks, setSavingBlocks] = useState(false);
  const [savedBlocks, setSavedBlocks] = useState(false);

  const ticketsHref = `/dashboard/events/${eventId}/tickets`;

  const load = useCallback(async () => {
    const { data, error } = await getEventById(eventId);
    if (error) {
      setError(error.message);
    } else {
      setEvent(data);
      const t = data?.ticketTypes?.find((x) => x.id === ticketId);
      if (t) setDraft(toDraft(t));
    }
    setLoading(false);
  }, [eventId, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ticket = useMemo<EventTicketType | undefined>(
    () => event?.ticketTypes?.find((t) => t.id === ticketId),
    [event, ticketId]
  );

  const formFields = useMemo(
    () => (event?.formFields ?? []).filter((f) => f.ticketTypeId === ticketId),
    [event, ticketId]
  );

  // Other ticket types on this event — the candidates this ticket can block.
  const otherTickets = useMemo(
    () => (event?.ticketTypes ?? []).filter((t) => t.id !== ticketId),
    [event, ticketId]
  );

  // Re-seed the local block selection whenever the ticket (re)loads.
  useEffect(() => {
    setBlockedIds(new Set((ticket?.blocks ?? []).map((b) => b.blockedId)));
  }, [ticket]);

  const toggleBlocked = (id: string) => {
    setBlockedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveRestrictions = async () => {
    setSavingBlocks(true);
    setError("");
    setSavedBlocks(false);
    const { error } = await updateTicketType(eventId, ticketId, {
      blocksTicketTypeIds: Array.from(blockedIds),
    });
    setSavingBlocks(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSavedBlocks(true);
    setTimeout(() => setSavedBlocks(false), 2500);
    await load();
  };

  const saveDetails = async () => {
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
      // Empty clears the bound; a value sets/changes it (see backend update).
      saleStartsAt: saleStartsAt ?? null,
      saleEndsAt: saleEndsAt ?? null,
      perUserLimit: Number(draft.perUserLimit) || 1,
      // Always sent on update: clearing the capacity has to switch the waiting
      // list off in the same request, or the API rejects the pair.
      waitlistEnabled: Boolean(capacity && draft.waitlistEnabled),
      waitlistOfferTtlHours: Number(draft.waitlistOfferTtlHours) || 24,
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
    setSaved(false);
    const { error } = await updateTicketType(eventId, ticketId, payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!ticket || !draft) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ticket" />
        <ErrorNotice message={error || "Ticket not found"} />
        <Button variant="outline" onClick={() => router.push(ticketsHref)}>
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </Button>
      </div>
    );
  }

  const isGroup = ticket.kind === "GROUP";

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(ticketsHref)}
          className="mb-2 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Tickets
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground">
            {ticket.name}
          </h1>
          <Badge variant={isGroup ? "brand" : "neutral"}>
            {isGroup ? (
              <UsersThree className="mr-1 h-3 w-3" />
            ) : (
              <User className="mr-1 h-3 w-3" />
            )}
            {isGroup ? "Group" : "Individual"}
          </Badge>
          {Number(ticket.price) === 0 && (
            <Badge variant="success">Free</Badge>
          )}
        </div>
      </div>

      {error && <ErrorNotice message={error} />}
      {saved && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle className="h-4 w-4" weight="fill" />
          Ticket details saved
        </div>
      )}

      {/* Ticket details */}
      <TicketForm
        title="Ticket details"
        draft={draft}
        setDraft={setDraft}
        onSave={saveDetails}
        onCancel={() => router.push(ticketsHref)}
        saving={saving}
        saveLabel="Save details"
      />

      {/* Registration form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration form</CardTitle>
          <CardDescription>
            Every attendee is always asked for{" "}
            <span className="font-medium text-foreground">
              {DEFAULT_FIELDS.join(", ")}
            </span>
            . Add any extra questions specific to this ticket below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormFieldsManager
            eventId={eventId}
            ticketTypeId={ticketId}
            fields={formFields}
            isGroup={isGroup}
            onChanged={load}
          />
        </CardContent>
      </Card>

      {/* Registration restrictions */}
      {otherTickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registration restrictions</CardTitle>
            <CardDescription>
              Pick the tickets that become unavailable once an attendee holds{" "}
              <span className="font-medium text-foreground">{ticket.name}</span>.
              This is one-directional — it doesn&apos;t stop someone who already
              bought those tickets from also buying this one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {otherTickets.map((t) => {
                const on = blockedIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleBlocked(t.id)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-primary/20 bg-primary-soft text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {on && <CheckCircle className="h-3.5 w-3.5" weight="fill" />}
                    {t.name}
                  </button>
                );
              })}
            </div>
            {savedBlocks && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle className="h-4 w-4" weight="fill" />
                Restrictions saved
              </div>
            )}
            <Button size="sm" onClick={saveRestrictions} disabled={savingBlocks}>
              {savingBlocks ? "Saving…" : "Save restrictions"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
