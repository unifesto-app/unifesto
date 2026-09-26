"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Lightning, Plus, Trash, PencilSimple } from "@phosphor-icons/react";
import {
  getEventById,
  createTicketType,
  updateTicketType,
  deleteTicketType,
  type EventTicketType,
  type Event,
} from "@/lib/api/events-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Draft {
  id?: string;
  name: string;
  description: string;
  capacity: string;
}

const EMPTY: Draft = { name: "", description: "", capacity: "" };

export default function EventRsvpsPage() {
  const params = useParams();
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

  const rsvps = (event?.ticketTypes ?? []).filter((t) => t.kind === "RSVP");

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setError("RSVP name is required.");
      return;
    }
    const capacity = draft.capacity.trim() ? Number(draft.capacity) : undefined;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      kind: "RSVP" as const,
      price: 0,
      totalQuantity: capacity,
    };
    setSaving(true);
    setError("");
    const { error } = draft.id
      ? await updateTicketType(eventId, draft.id, payload)
      : await createTicketType(eventId, payload);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDraft(null);
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this RSVP type?")) return;
    const { error } = await deleteTicketType(eventId, id);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="RSVPs"
        subtitle="One-click, free registration options for this event"
        actions={
          !draft ? (
            <Button onClick={() => setDraft({ ...EMPTY })}>
              <Plus className="h-4 w-4" weight="bold" />
              Add RSVP
            </Button>
          ) : undefined
        }
      />

      {error && <ErrorNotice message={error} />}

      {draft && (
        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="text-base">
              {draft.id ? "Edit RSVP" : "New RSVP"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. I'll attend"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Shown to attendees"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Capacity (blank = unlimited)</Label>
              <Input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(e) =>
                  setDraft({ ...draft, capacity: e.target.value })
                }
                placeholder="Unlimited"
                className="sm:w-40"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setError("");
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : draft.id ? "Save changes" : "Create RSVP"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rsvps.length === 0 && !draft ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Lightning}
              title="No RSVP types yet"
              description="Add a one-click RSVP so attendees can register instantly without payment. For paid or custom-form entry, use the Tickets tab."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rsvps.map((t: EventTicketType) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{t.name}</span>
                    <Badge variant="success">One-click</Badge>
                  </div>
                  {t.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground line-clamp-1">
                      {t.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.totalQuantity != null
                      ? `${t.soldCount}/${t.totalQuantity} registered`
                      : `${t.soldCount} registered · unlimited`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: t.id,
                        name: t.name,
                        description: t.description ?? "",
                        capacity:
                          t.totalQuantity != null ? String(t.totalQuantity) : "",
                      })
                    }
                  >
                    <PencilSimple className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
