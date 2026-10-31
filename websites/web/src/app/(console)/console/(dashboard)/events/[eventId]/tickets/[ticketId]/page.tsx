"use client";

import { inr } from "@/console/lib/utils/money";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  UsersThree,
  User,
  CheckCircle,
  ArrowRight,
} from "@unifesto/unicon/react";
import {
  getEventById,
  getManageTicketTypes,
  updateTicketType,
  type ManagedTicketType,
  type Event,
} from "@/console/lib/api/events-api";
import {
  SALE_STATUS_META,
  isOffSale,
  ticketSaleStatus,
} from "@/console/components/events/ticket-status";
import { Input } from "@/console/components/ui/input";
import {
  type Draft,
  toDraft,
  TicketForm,
  FormFieldsManager,
  DEFAULT_FIELDS,
  localToIso,
} from "@/console/components/events/ticket-editor";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { cn } from "@/console/lib/utils/cn";
import { Button } from "@/console/components/ui/button";
import { Badge } from "@/console/components/ui/badge";
import { Skeleton } from "@/console/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;
  const ticketId = params.ticketId as string;

  const [event, setEvent] = useState<Event | null>(null);
  // Operator list incl. hidden tiers — the public event payload omits those,
  // so a hidden ticket would otherwise read as "not found" here.
  const [allTickets, setAllTickets] = useState<ManagedTicketType[]>([]);
  const [waLink, setWaLink] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
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

  const ticketsHref = `/console/events/${eventId}/tickets`;

  const load = useCallback(async () => {
    const [ev, tiers] = await Promise.all([
      getEventById(eventId),
      getManageTicketTypes(eventId),
    ]);
    const err = ev.error ?? tiers.error;
    if (err) {
      setError(err.message);
    } else {
      setEvent(ev.data);
      setAllTickets(tiers.data ?? []);
      const t = tiers.data?.find((x) => x.id === ticketId);
      if (t) {
        setDraft(toDraft(t));
        setWaLink(t.whatsappGroupUrl ?? "");
      }
    }
    setLoading(false);
  }, [eventId, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const ticket = useMemo<ManagedTicketType | undefined>(
    () => allTickets.find((t) => t.id === ticketId),
    [allTickets, ticketId]
  );

  const formFields = useMemo(
    () => (event?.formFields ?? []).filter((f) => f.ticketTypeId === ticketId),
    [event, ticketId]
  );

  // Other ticket types on this event — the candidates this ticket can block.
  const otherTickets = useMemo(
    () => allTickets.filter((t) => t.id !== ticketId),
    [allTickets, ticketId]
  );

  // Small single-field saves (availability, WhatsApp link) share one path.
  const patchTicket = async (
    payload: Parameters<typeof updateTicketType>[2]
  ) => {
    setSavingMeta(true);
    setError("");
    const { error } = await updateTicketType(eventId, ticketId, payload);
    setSavingMeta(false);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  };

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
    // Blank = unlimited, sent as null so it clears the old capacity.
    const capacity = draft.capacity.trim() ? Number(draft.capacity) : null;
    const saleStartsAt = localToIso(draft.saleStartsAt);
    const saleEndsAt = localToIso(draft.saleEndsAt);
    if (saleStartsAt && saleEndsAt && saleEndsAt <= saleStartsAt) {
      setError("Sales end must be after sales start.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
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
      <div className="space-y-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!ticket || !draft) {
    return (
      <div className="space-y-4">
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
  const saleStatus = ticketSaleStatus(ticket, event);
  const status = SALE_STATUS_META[saleStatus];
  const offSale = isOffSale(ticket);
  const { stats } = ticket;

  return (
    <div className="space-y-4">
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
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MiniStat
          label="Seats taken"
          value={
            ticket.totalQuantity != null
              ? `${ticket.soldCount} / ${ticket.totalQuantity}`
              : `${ticket.soldCount}`
          }
        />
        <MiniStat label="Checked in" value={`${stats.checkedIn} / ${stats.registrations}`} />
        <MiniStat
          label="Waiting list"
          value={`${stats.waitlistWaiting} waiting · ${stats.waitlistOffered} offered`}
        />
        {stats.revenue != null && (
          <MiniStat
            label="Net revenue"
            value={inr(stats.revenue)}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/console/events/${eventId}/attendees?ticket=${ticketId}`}>
            View attendees
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        {ticket.waitlistEnabled && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/console/events/${eventId}/waitlist`}>
              Manage waiting list
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>

      {error && <ErrorNotice message={error} />}
      {saved && (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          <CheckCircle className="h-4 w-4" weight="fill" />
          Ticket details saved
        </div>
      )}

      {/* Availability */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Availability</CardTitle>
          <CardDescription>
            {offSale
              ? "Hidden from the event page and can't be bought. Existing holders keep their tickets."
              : saleStatus === "ended"
                ? "Listed on the event page. Sales have ended, so it can't be bought."
                : saleStatus === "sold-out"
                  ? "Listed on the event page. Sold out, so it can't be bought."
                  : "Listed on the event page and open for registration within its sales window."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            aria-pressed={offSale}
            variant={offSale ? "default" : "outline"}
            disabled={savingMeta}
            onClick={() =>
              patchTicket({ isVisible: offSale, isActive: offSale })
            }
          >
            {offSale ? "Put on sale" : "Hide ticket"}
          </Button>
        </CardContent>
      </Card>

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

      {/* WhatsApp group */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp group</CardTitle>
          <CardDescription>
            Holders of this ticket get this group link instead of the event&apos;s.
            Leave empty to fall back to the event group.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="https://chat.whatsapp.com/…"
            value={waLink}
            onChange={(e) => setWaLink(e.target.value)}
          />
          <Button
            size="sm"
            disabled={
              savingMeta || waLink.trim() === (ticket.whatsappGroupUrl ?? "")
            }
            onClick={() => patchTicket({ whatsappGroupUrl: waLink.trim() })}
          >
            Save link
          </Button>
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
              It works one way: it doesn&apos;t stop someone who already
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
                      "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors",
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
              <div className="flex items-center gap-2 text-sm text-success">
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
