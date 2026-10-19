"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash,
  Handshake,
  Download,
  UserPlus,
  CheckCircle,
  Circle,
} from "@unifesto/unicon/react";
import { getSpaceEvents, type Event } from "@/lib/api/events-api";
import {
  listEventSponsors,
  listSponsors,
  attachSponsor,
  updateEventSponsor,
  detachSponsor,
  listTiers,
  listEventLeads,
  type EventSponsor,
  type Sponsor,
  type SponsorTier,
  type EventLead,
} from "@/lib/api/sponsors-api";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const NO_TIER = "__none__";

const SOURCE_LABEL: Record<string, string> = {
  OPT_IN: "Opted in",
  BOOTH_SCAN: "Booth scan",
  MANUAL: "Manual",
  IMPORT: "Import",
};

export function EventSponsorsTab({ spaceId }: { spaceId: string }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [eventId, setEventId] = useState<string>("");
  const [loadingEvents, setLoadingEvents] = useState(true);

  const [attached, setAttached] = useState<EventSponsor[]>([]);
  const [roster, setRoster] = useState<Sponsor[]>([]);
  const [tiers, setTiers] = useState<SponsorTier[]>([]);
  const [leads, setLeads] = useState<EventLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attachOpen, setAttachOpen] = useState(false);

  // Load the space's events once, and default to the first.
  useEffect(() => {
    (async () => {
      setLoadingEvents(true);
      const { data } = await getSpaceEvents(spaceId, { limit: 100 });
      const list = data?.events ?? [];
      setEvents(list);
      if (list.length && !eventId) setEventId(list[0].id);
      setLoadingEvents(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    const [es, rs, ts, ls] = await Promise.all([
      listEventSponsors(spaceId, eventId),
      listSponsors(spaceId),
      listTiers(spaceId),
      listEventLeads(spaceId, eventId),
    ]);
    if (es.error) setError(es.error.message ?? "Could not load event sponsors.");
    setAttached(es.data ?? []);
    setRoster(rs.data ?? []);
    setTiers(ts.data ?? []);
    setLeads(ls.data ?? []);
    setLoading(false);
  }, [spaceId, eventId]);

  useEffect(() => {
    loadEvent();
  }, [loadEvent]);

  const unattached = useMemo(() => {
    const taken = new Set(attached.map((a) => a.sponsorId));
    return roster.filter((s) => !taken.has(s.id));
  }, [attached, roster]);

  const patch = async (es: EventSponsor, changes: Parameters<typeof updateEventSponsor>[3]) => {
    // Optimistic; reconcile on the server response.
    const { data, error } = await updateEventSponsor(spaceId, eventId, es.id, changes);
    if (error) {
      setError(error.message ?? "Could not update.");
      return;
    }
    // The update response omits `_count` (lead totals) — carry the prior value
    // so the "N leads" badge doesn't blank out after a tier/toggle change.
    if (data)
      setAttached((prev) =>
        prev.map((a) => (a.id === es.id ? { ...data, _count: a._count } : a))
      );
  };

  const detach = async (es: EventSponsor) => {
    if (!window.confirm(`Remove ${es.sponsor.name} from this event? Its captured leads are deleted.`))
      return;
    const { error } = await detachSponsor(spaceId, eventId, es.id);
    if (error) setError(error.message ?? "Could not remove sponsor.");
    else loadEvent();
  };

  const exportLeads = () => {
    if (leads.length === 0) return;
    const header = ["Sponsor", "Name", "Email", "Phone", "Source", "Note", "Captured at"];
    const rows = leads.map((l) => [
      l.sponsorName,
      l.name ?? "",
      l.email ?? "",
      l.phone ?? "",
      SOURCE_LABEL[l.source] ?? l.source,
      l.note ?? "",
      new Date(l.createdAt).toISOString(),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ev = events.find((e) => e.id === eventId);
    a.download = `sponsor-leads-${ev?.slug ?? eventId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loadingEvents) return <Skeleton className="h-10 w-72 rounded-md" />;

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="No events yet"
        description="Create an event first, then attach sponsors to it here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Event</Label>
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setAttachOpen(true)} disabled={unattached.length === 0}>
          <Plus className="h-4 w-4" /> Attach sponsor
        </Button>
      </div>

      {error && <ErrorNotice message={error} />}

      {/* Attached sponsors */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Attached sponsors</h3>
        {loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : attached.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="No sponsors on this event"
            description="Attach a sponsor from your roster to show it on the event page."
          />
        ) : (
          <div className="space-y-2">
            {attached.map((es) => (
              <Card key={es.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  {es.sponsor.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={es.sponsor.logoUrl}
                      alt=""
                      className="h-10 w-10 rounded-md bg-white object-contain"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-xs font-bold text-primary">
                      {es.sponsor.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {es.sponsor.name}
                  </span>

                  {/* Tier */}
                  <Select
                    value={es.tierId ?? NO_TIER}
                    onValueChange={(v) =>
                      patch(es, { tierId: v === NO_TIER ? null : v })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="No tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TIER}>No tier</SelectItem>
                      {tiers.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Lead capture toggle */}
                  <Button
                    variant={es.leadCaptureEnabled ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => patch(es, { leadCaptureEnabled: !es.leadCaptureEnabled })}
                  >
                    {es.leadCaptureEnabled ? (
                      <CheckCircle className="h-4 w-4 text-primary" weight="fill" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    Lead capture
                  </Button>

                  <Badge variant="neutral">
                    {es._count?.leads ?? 0} lead{(es._count?.leads ?? 0) === 1 ? "" : "s"}
                  </Badge>

                  <Button variant="ghost" size="icon" onClick={() => detach(es)} aria-label="Remove">
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Lead inbox */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Leads {leads.length > 0 && <span className="text-muted-foreground">({leads.length})</span>}
          </h3>
          <Button variant="outline" size="sm" onClick={exportLeads} disabled={leads.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : leads.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="No leads yet"
            description="When attendees opt in (or are scanned at a booth) for a lead-capturing sponsor, they appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Sponsor</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Captured</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{l.sponsorName}</td>
                    <td className="px-3 py-2">{l.name ?? "—"}</td>
                    <td className="px-3 py-2">{l.email ?? "—"}</td>
                    <td className="px-3 py-2">{l.phone ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant="neutral">{SOURCE_LABEL[l.source] ?? l.source}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(l.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Attach dialog */}
      <AttachDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        unattached={unattached}
        tiers={tiers}
        onAttach={async (payload) => {
          const { error } = await attachSponsor(spaceId, eventId, payload);
          if (error) {
            setError(error.message ?? "Could not attach sponsor.");
            return false;
          }
          setAttachOpen(false);
          loadEvent();
          return true;
        }}
      />
    </div>
  );
}

function AttachDialog({
  open,
  onOpenChange,
  unattached,
  tiers,
  onAttach,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unattached: Sponsor[];
  tiers: SponsorTier[];
  onAttach: (payload: {
    sponsorId: string;
    tierId?: string;
    leadCaptureEnabled?: boolean;
  }) => Promise<boolean>;
}) {
  const [sponsorId, setSponsorId] = useState("");
  const [tierId, setTierId] = useState(NO_TIER);
  const [leadCapture, setLeadCapture] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSponsorId("");
      setTierId(NO_TIER);
      setLeadCapture(false);
    }
  }, [open]);

  const submit = async () => {
    if (!sponsorId) return;
    setSaving(true);
    await onAttach({
      sponsorId,
      ...(tierId !== NO_TIER ? { tierId } : {}),
      leadCaptureEnabled: leadCapture,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a sponsor</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Sponsor</Label>
            <Select value={sponsorId} onValueChange={setSponsorId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose from your roster" />
              </SelectTrigger>
              <SelectContent>
                {unattached.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tier (optional)</Label>
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger>
                <SelectValue placeholder="No tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TIER}>No tier</SelectItem>
                {tiers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={leadCapture}
              onChange={(e) => setLeadCapture(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Enable attendee lead capture for this sponsor
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !sponsorId}>
            {saving ? "Attaching…" : "Attach"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
