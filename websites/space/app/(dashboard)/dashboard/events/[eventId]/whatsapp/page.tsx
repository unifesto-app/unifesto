"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  WhatsappLogo,
  LockKey,
  PaperPlaneTilt,
  Spinner,
  Check,
} from "@phosphor-icons/react";
import {
  getEventWhatsappConfig,
  updateEvent,
  updateTicketType,
  type WhatsAppTicketGroup,
} from "@/lib/api/events-api";
import { sendWhatsappGroupInvite } from "@/lib/api/registrations-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The event's WhatsApp detail page. Home for the PRIVATE attendee invite group —
 * a link that, unlike the retired public group/community fields, never rides on
 * the public event payload (so it can't leak on older app versions). It is only
 * pushed to confirmed attendees (on registration + via the blast below).
 *
 * Owns three things: the event-level attendee group, optional per-ticket-type
 * overrides (a tier can route to its own group), and the manual invite blast.
 * Saving reuses the existing event / ticket-type PATCH endpoints; the config is
 * read from the manage-only `GET /events/:id/whatsapp`.
 */
export default function EventWhatsAppPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);

  // Editable state.
  const [attendeeUrl, setAttendeeUrl] = useState("");
  const [ticketUrls, setTicketUrls] = useState<Record<string, string>>({});
  const [tickets, setTickets] = useState<WhatsAppTicketGroup[]>([]);
  const [parentUrl, setParentUrl] = useState<string | null>(null);

  // Snapshot of what the server currently holds, to diff on save.
  const [initial, setInitial] = useState<{
    attendee: string;
    tickets: Record<string, string>;
  }>({ attendee: "", tickets: {} });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: apiError } = await getEventWhatsappConfig(eventId);
    if (apiError || !data) {
      setError(apiError?.message ?? "Could not load the WhatsApp settings.");
      setLoading(false);
      return;
    }
    const attendee = data.whatsappAttendeeGroupUrl ?? "";
    const ticketMap: Record<string, string> = {};
    for (const t of data.ticketTypes) ticketMap[t.id] = t.whatsappGroupUrl ?? "";

    setAttendeeUrl(attendee);
    setTickets(data.ticketTypes);
    setTicketUrls(ticketMap);
    setParentUrl(data.parentAttendeeGroupUrl);
    setInitial({ attendee, tickets: ticketMap });
    setError("");
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Anything to save? Event-level link changed, or any ticket override changed.
  const dirty = useMemo(() => {
    if (attendeeUrl.trim() !== initial.attendee.trim()) return true;
    return tickets.some(
      (t) => (ticketUrls[t.id] ?? "").trim() !== (initial.tickets[t.id] ?? "").trim()
    );
  }, [attendeeUrl, ticketUrls, tickets, initial]);

  const setTicketUrl = (id: string, value: string) =>
    setTicketUrls((m) => ({ ...m, [id]: value }));

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError("");

    // Event-level link — only PATCH when it actually changed. An empty string
    // clears it server-side.
    if (attendeeUrl.trim() !== initial.attendee.trim()) {
      const { error: apiError } = await updateEvent(eventId, {
        whatsappAttendeeGroupUrl: attendeeUrl.trim(),
      });
      if (apiError) {
        setError(apiError.message);
        setSaving(false);
        return;
      }
    }

    // Per-ticket overrides — one PATCH per changed tier (whatsapp-only body is
    // safe; the backend preserves every other ticket field).
    for (const t of tickets) {
      const next = (ticketUrls[t.id] ?? "").trim();
      if (next === (initial.tickets[t.id] ?? "").trim()) continue;
      const { error: apiError } = await updateTicketType(eventId, t.id, {
        whatsappGroupUrl: next,
      });
      if (apiError) {
        setError(`${t.name}: ${apiError.message}`);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    await load();
    // Clear the confirmation tick after a moment.
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSendBlast = async () => {
    // Messaging real attendees is outward-facing, so confirm first. Only those
    // not yet invited / not self-marked joined receive it (send-once).
    if (
      !window.confirm(
        "Send the WhatsApp attendee-group invite to confirmed attendees who haven't been invited or already joined?"
      )
    ) {
      return;
    }
    setSending(true);
    const { data, error: apiError } = await sendWhatsappGroupInvite(eventId);
    if (apiError) {
      alert(apiError.message);
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
    setSending(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const usingParentFallback = !attendeeUrl.trim() && !!parentUrl;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registrations"
        title="WhatsApp group"
        subtitle="Route registered attendees into a private WhatsApp group. This link is only ever sent to people who register — it never shows on the public event page."
      />

      {error && <ErrorNotice message={error} />}

      {/* Why this is private — the whole point of the feature. */}
      <div className="flex gap-3 rounded-lg border border-border bg-muted/40 p-4">
        <LockKey className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Private to attendees</p>
          <p className="mt-1">
            Create the group in WhatsApp yourself, then paste its invite link
            below. We message it to each attendee when they register, and you can
            send a manual blast anytime. Unlike the old public link, this one is
            never exposed on the event page or in the app to non-attendees.
          </p>
        </div>
      </div>

      {/* Event-level attendee group */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <WhatsappLogo className="h-4 w-4" />
            Attendee invite group
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4 py-4">
          <Label htmlFor="attendeeGroupUrl">Group invite link</Label>
          <Input
            id="attendeeGroupUrl"
            type="url"
            inputMode="url"
            value={attendeeUrl}
            onChange={(e) => setAttendeeUrl(e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
          />
          {usingParentFallback && (
            <p className="text-xs text-muted-foreground">
              This event has no group of its own, so attendees are invited to the
              parent event&apos;s group:{" "}
              <span className="break-all font-medium text-foreground">
                {parentUrl}
              </span>
              . Set a link above to override it.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Per-ticket-type overrides */}
      {tickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per-ticket groups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              Give a ticket tier its own group — holders of that ticket are
              invited here instead of the event group. Leave blank to use the
              event group above.
            </p>
            {tickets.map((t) => (
              <div key={t.id} className="space-y-2">
                <Label htmlFor={`tt-${t.id}`}>{t.name}</Label>
                <Input
                  id={`tt-${t.id}`}
                  type="url"
                  inputMode="url"
                  value={ticketUrls[t.id] ?? ""}
                  onChange={(e) => setTicketUrl(t.id, e.target.value)}
                  placeholder="https://chat.whatsapp.com/…"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Save bar */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={!dirty || saving}>
          {saving ? (
            <>
              <Spinner className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        {dirty && !saving && (
          <span className="text-sm text-muted-foreground">Unsaved changes</span>
        )}
      </div>

      {/* Manual blast */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PaperPlaneTilt className="h-4 w-4" />
            Send invites
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            Message the invite link to confirmed attendees who haven&apos;t been
            invited yet or already joined. Safe to run more than once — nobody is
            messaged twice.
          </p>
          <Button
            variant="outline"
            onClick={handleSendBlast}
            disabled={sending}
          >
            {sending ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <PaperPlaneTilt className="h-4 w-4" />
                Send invite blast
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
