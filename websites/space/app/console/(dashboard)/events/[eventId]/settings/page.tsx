"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Warning,
  Trash,
  XCircle,
  Spinner,
  EyeSlash,
  ArrowCounterClockwise,
} from "@unifesto/unicon/react";
import {
  getEventById,
  cancelEvent,
  hideEvent,
  restoreEvent,
  deleteEvent,
  setAttendeeControls,
  type AttendeeControls,
  type Event,
} from "@/console/lib/api/events-api";
import { toLocalDatetime } from "@/console/lib/constants/event-form";
import { Toggle } from "@/console/components/hackathon/HackParts";
import { useAccess } from "@/console/lib/context/SessionContext";
import {
  getEventEligibleAccounts,
  setEventPayoutAccount,
  type EligibleAccount,
} from "@/console/lib/api/payouts-api";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Button } from "@/console/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import { Label } from "@/console/components/ui/label";
import { Badge } from "@/console/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";

export default function EventSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const { can } = useAccess(eventId);
  // Publish, cancel, hide, restore and delete belong to the event's owners (T1).
  const canPublish = can("event:publish");
  // Cancel, hide/restore and delete all need event:cancel on the backend.
  const canCancel = can("event:cancel");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Cancel dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [hiding, setHiding] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: apiError } = await getEventById(eventId);

      if (!active) return;

      if (apiError || !data) {
        setError(apiError?.message || "Event not found");
        setLoading(false);
        return;
      }

      setEvent(data);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [eventId]);

  const handleCancelEvent = async () => {
    if (!event) return;

    setCancelling(true);
    setError("");

    const { data, error: apiError } = await cancelEvent(
      eventId,
      cancelReason.trim() || undefined
    );

    setCancelling(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    if (data) {
      setEvent(data);
      setCancelDialogOpen(false);
      setCancelReason("");
    }
  };

  const handleHideEvent = async () => {
    if (!event) return;
    setHiding(true);
    setError("");
    const { data, error: apiError } = await hideEvent(eventId);
    setHiding(false);
    if (apiError) {
      setError(apiError.message);
      return;
    }
    setHideDialogOpen(false);
    // Stay on the page rather than redirecting: hiding is reversible, and the
    // organiser needs the Restore button right where the Hide button was.
    if (data) setEvent(data);
  };

  const handleRestoreEvent = async () => {
    if (!event) return;
    setHiding(true);
    setError("");
    const { data, error: apiError } = await restoreEvent(eventId);
    setHiding(false);
    if (apiError) {
      setError(apiError.message);
      return;
    }
    if (data) setEvent(data);
  };

  const handleDeleteEvent = async () => {
    if (!event) return;

    setDeleting(true);
    setError("");

    const { error: apiError } = await deleteEvent(eventId);

    setDeleting(false);

    if (apiError) {
      setError(apiError.message);
      return;
    }

    // Successfully deleted - redirect to events list
    router.push(`/console/events`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="space-y-6">
        <PageHeader title="Event settings" />
        <ErrorNotice message={error} />
      </div>
    );
  }

  if (!event) return null;

  const isCancelled = event.status === "CANCELLED";
  const isDraft = event.status === "DRAFT";
  const isPublished = event.status === "PUBLISHED";
  const isCompleted = event.status === "COMPLETED";
  const isOngoing = event.status === "ONGOING";
  const isHidden = Boolean(event.deletedAt);

  // The two actions have deliberately different rules.
  //
  // Hiding is for events that are over — completed or cancelled. It destroys
  // nothing, so the only thing that matters is that nobody still depends on the
  // event being visible. A running event fails that test.
  const canHide = (isCompleted || isCancelled) && !isHidden;

  // Permanent deletion is refused once an event has completed: it happened,
  // people attended and paid, and that record is not the organiser's to erase.
  // That leaves drafts (nothing of value) and cancelled events (called off).
  const canDelete = isCancelled || isDraft;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Event settings"
        subtitle="Manage event status and danger zone actions"
      />

      {error && <ErrorNotice message={error} />}

      {/* Event Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base">Current status</Label>
              <p className="text-sm text-muted-foreground">
                {event.status === "DRAFT" && "Event is in draft mode"}
                {event.status === "PUBLISHED" && "Event is live and accepting registrations"}
                {event.status === "ONGOING" && "Event is happening now"}
                {event.status === "COMPLETED" && "Event has finished"}
                {event.status === "CANCELLED" && "Event has been cancelled"}
              </p>
            </div>
            <Badge
              variant={
                event.status === "PUBLISHED" || event.status === "ONGOING"
                  ? "success"
                  : event.status === "CANCELLED"
                  ? "destructive"
                  : "neutral"
              }
            >
              {event.status}
            </Badge>
          </div>

          {isCancelled && event.cancelledAt && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Cancelled on {new Date(event.cancelledAt).toLocaleDateString("en-IN")}
                  </p>
                  {event.cancellationReason && (
                    <p className="text-sm text-muted-foreground">
                      Reason: {event.cancellationReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Status Change Actions - only show if not cancelled */}
          {!isCancelled && canPublish && (
            <div className="pt-4 border-t border-border">
              {isDraft && (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      Publish event
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Make this event visible to attendees and start accepting registrations.
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      if (!window.confirm("Publish this event? It will be visible to attendees.")) return;
                      setLoading(true);
                      setError("");
                      const { publishEvent } = await import("@/console/lib/api/events-api");
                      const { error: publishError } = await publishEvent(eventId);
                      if (publishError) {
                        setError(publishError.message);
                        setLoading(false);
                      } else {
                        window.location.reload();
                      }
                    }}
                    className="flex-shrink-0"
                  >
                    Publish event
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isCompleted && !isCancelled && (
        <AttendeeControlsCard
          event={event}
          onSaved={(c) => setEvent((e) => (e ? { ...e, ...c } : e))}
        />
      )}

      {/* Payout account — default destination for this event's earnings. */}
      {(can("event:manage-money") || can("space:manage-money")) && (
        <EventPayoutAccountCard eventId={eventId} />
      )}

      {/* Danger Zone */}
      {canCancel && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Warning className="h-5 w-5" />
              Danger zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 px-4 py-4">
            {/* Cancel Event — also while it's running (a called-off day two). */}
            {(isPublished || isOngoing) && (
              <div className="flex items-start justify-between gap-4 pb-6 border-b border-border">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">
                    Cancel event
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Mark this event as cancelled. Attendees will be notified.
                    After cancelling, you can delete the event.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setCancelDialogOpen(true)}
                  className="flex-shrink-0"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel event
                </Button>
              </div>
            )}

            {/* Hide / restore — the reversible option, offered first because it
                is almost always the right one for a finished event. */}
            <div className="flex items-start justify-between gap-4 border-b border-border pb-6">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  {isHidden ? "Restore event" : "Hide event"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isHidden
                    ? "This event is hidden. Restoring puts it back everywhere, with its registrations, tickets and payments exactly as they were."
                    : canHide
                      ? "Take this event off every listing without deleting anything. Registrations, tickets and payments are kept, and you can restore it at any time."
                      : isOngoing
                        ? "This event is running right now. You can hide it once it finishes."
                        : "Only completed or cancelled events can be hidden. Cancel this event first."}
                </p>
              </div>
              <Button
                aria-pressed={isHidden}
                variant={isHidden ? "default" : "outline"}
                onClick={() => {
                  setError("");
                  if (isHidden) void handleRestoreEvent();
                  else setHideDialogOpen(true);
                }}
                disabled={hiding || (!canHide && !isHidden)}
                className="flex-shrink-0"
              >
                {isHidden ? (
                  <ArrowCounterClockwise className="h-4 w-4" />
                ) : (
                  <EyeSlash className="h-4 w-4" />
                )}
                {hiding
                  ? "Working…"
                  : isHidden
                    ? "Restore event"
                    : "Hide event"}
              </Button>
            </div>

            {/* Permanent delete */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Delete permanently
                </h3>
                <p className="text-sm text-muted-foreground">
                  {canDelete
                    ? isCancelled
                      ? "This cancelled event can be permanently deleted. Everything goes with it, and this cannot be undone."
                      : "Permanently delete this draft. This cannot be undone."
                    : isCompleted
                      ? "A completed event cannot be deleted: its attendance and payment records have to be kept. Hide it instead."
                      : "To delete a published event, you must first cancel it."}
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  setError("");
                  setDeleteDialogOpen(true);
                }}
                disabled={!canDelete}
                className="flex-shrink-0"
              >
                <Trash className="h-4 w-4" />
                Delete permanently
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Event Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
              <div className="flex items-start gap-3">
                <Warning className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Are you sure you want to cancel this event?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All registered attendees are notified and sub-events are
                    cancelled too. Every paid attendee gets their ticket price back
                    (the processing fee is kept), sent by Unifesto. Payouts for this
                    event stop until those refunds go out.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">
                Cancellation reason (optional)
              </Label>
              <textarea
                id="reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Due to unforeseen circumstances..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                This will be shown to attendees.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
              }}
              disabled={cancelling}
            >
              Keep event
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelEvent}
              disabled={cancelling}
            >
              {cancelling ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  Cancel event
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete event</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <Trash className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    This action is permanent and cannot be undone
                  </p>
                  <p className="text-sm text-muted-foreground">
                    All event data, registrations, tickets, and content will be
                    permanently deleted. This cannot be reversed.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Event: {event.title}</p>
              <p className="text-sm text-muted-foreground">
                Status: {event.status}
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteEvent}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash className="h-4 w-4" />
                  Delete permanently
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hide confirmation. Softer than the delete dialog on purpose — this is
          reversible, and framing it as destructive would push organisers toward
          the genuinely destructive option instead. */}
      <Dialog open={hideDialogOpen} onOpenChange={setHideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hide this event?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">{event.title}</strong> will
              disappear from listings, search and attendees&apos; ticket lists.
            </p>
            <p>
              Nothing is deleted. Its registrations, tickets, payments and
              payouts are kept, and restoring the event brings all of it back
              exactly as it is now.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setHideDialogOpen(false)}
              disabled={hiding}
            >
              Cancel
            </Button>
            <Button onClick={handleHideEvent} disabled={hiding}>
              {hiding ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" />
                  Hiding…
                </>
              ) : (
                <>
                  <EyeSlash className="h-4 w-4" />
                  Hide event
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ControlsPatch = Parameters<typeof setAttendeeControls>[1];

/**
 * Team-change and detail-edit switches (same as mobile Event settings). Each
 * change saves at once; the card shows what the server returned.
 */
function AttendeeControlsCard({
  event,
  onSaved,
}: {
  event: Event;
  onSaved: (c: AttendeeControls) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  async function save(body: ControlsPatch) {
    setBusy(true);
    setError("");
    const { data, error } = await setAttendeeControls(event.id, body);
    setBusy(false);
    if (error) setError(error.message);
    else if (data) onSaved(data);
  }

  // A new deadline defaults to the day before the event starts, never in the past.
  const defaultDeadline = () =>
    new Date(Math.max(Date.now() + 3600e3, new Date(event.startDateTime).getTime() - 864e5)).toISOString();

  const editsLocked =
    event.attendeeEditsEnabled &&
    event.attendeeEditsUntil &&
    new Date(event.attendeeEditsUntil).getTime() <= now;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendees</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        {error && <ErrorNotice message={error} />}

        <Toggle
          label="Allow team changes"
          hint="Team leads can add, remove or replace members and hand over the lead. You can always do this from Attendees."
          checked={!!event.allowTeamChanges}
          disabled={busy}
          onChange={(v) => save({ allowTeamChanges: v })}
        />
        {event.allowTeamChanges && (
          <Deadline
            toggleLabel="Lock teams at a set time"
            inputLabel="Teams lock"
            value={event.teamChangesUntil ?? null}
            busy={busy}
            onChange={(v) => save({ teamChangesUntil: v === undefined ? defaultDeadline() : v })}
          />
        )}

        <div className="border-t border-border pt-4">
          <Toggle
            label="Attendees can edit their details"
            hint="People can change their registration answers from their ticket. Group leads edit the team's, members their own."
            checked={!!event.attendeeEditsEnabled}
            disabled={busy}
            onChange={(v) => save({ attendeeEditsEnabled: v })}
          />
        </div>
        {event.attendeeEditsEnabled && (
          <Deadline
            toggleLabel="Close edits at a set time"
            inputLabel="Edits close"
            value={event.attendeeEditsUntil ?? null}
            busy={busy}
            onChange={(v) => save({ attendeeEditsUntil: v === undefined ? defaultDeadline() : v })}
          />
        )}

        <p className="text-xs text-muted-foreground">
          {editsLocked
            ? "The edit deadline has passed, so details are locked. Move the deadline or turn it off to reopen."
            : "You can always edit any attendee's details from Attendees, whatever these say."}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * An optional deadline: a switch, then a date-time field once it's on.
 * onChange(undefined) asks for the default deadline, null clears it.
 */
function Deadline({
  toggleLabel,
  inputLabel,
  value,
  busy,
  onChange,
}: {
  toggleLabel: string;
  inputLabel: string;
  value: string | null;
  busy: boolean;
  onChange: (iso: string | null | undefined) => void;
}) {
  const local = value ? toLocalDatetime(value) : "";
  return (
    <div className="space-y-3 pl-4">
      <Toggle
        label={toggleLabel}
        checked={!!value}
        disabled={busy}
        onChange={(on) => onChange(on ? undefined : null)}
      />
      {value && (
        <div className="space-y-1">
          <Label htmlFor={`deadline-${toggleLabel}`}>{inputLabel}</Label>
          {/* Uncontrolled and saved on blur, so a half-typed date never saves. */}
          <input
            key={local}
            id={`deadline-${toggleLabel}`}
            type="datetime-local"
            defaultValue={local}
            disabled={busy}
            onBlur={(e) => {
              const v = e.target.value;
              if (v && v !== local) onChange(new Date(v).toISOString());
            }}
            className="flex h-9 w-full max-w-xs rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
          />
        </div>
      )}
    </div>
  );
}

/** Short label for an eligible payout account. */
function accountLabel(a: EligibleAccount): string {
  return a.methodType === "UPI"
    ? `${a.accountHolderName} · UPI ${a.upiId ?? ""}`
    : `${a.accountHolderName} · ${a.bankName ?? "Bank"} ****${a.accountNumberLast4 ?? ""}`;
}

/**
 * Choose the default account this event's payouts go to. Options are the
 * organiser's own verified methods plus those of the space's other space admins, so
 * an event's earnings can be routed to another space admin. "Creator's primary" is
 * the implicit default (cleared override); a specific choice is persisted.
 */
function EventPayoutAccountCard({ eventId }: { eventId: string }) {
  const [accounts, setAccounts] = useState<EligibleAccount[]>([]);
  const [selected, setSelected] = useState<string>(""); // "" = creator's primary
  const [initial, setInitial] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getEventEligibleAccounts(eventId).then(({ data, error }) => {
      if (!active) return;
      setLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      if (data) {
        setAccounts(data.accounts);
        const preset =
          data.selectedBankAccountId &&
          data.accounts.some((a) => a.id === data.selectedBankAccountId)
            ? data.selectedBankAccountId
            : "";
        setSelected(preset);
        setInitial(preset);
      }
    });
    return () => {
      active = false;
    };
  }, [eventId]);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const { error } = await setEventPayoutAccount(eventId, selected || null);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInitial(selected);
    setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payout account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4 py-4">
        <p className="text-sm text-muted-foreground">
          Where this event&apos;s earnings are paid out. Leave as the default to
          use the event creator&apos;s primary account, or route it to another
          space admin&apos;s verified account.
        </p>

        {error && <ErrorNotice message={error} />}

        {loading ? (
          <Skeleton className="h-9 w-full rounded-md" />
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setSaved(false);
              }}
              className="flex h-9 w-full max-w-md rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20"
            >
              <option value="">
                {(() => {
                  // The default is the event creator's primary, which may not be the viewer's.
                  const primary = accounts.find((a) => a.isOwn && a.isPrimary);
                  return primary
                    ? `Default: ${accountLabel(primary)}`
                    : "Default: event creator's primary account";
                })()}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                  {a.isOwn ? "" : ` · ${a.ownerName} (space admin)`}
                </option>
              ))}
            </select>

            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No verified accounts yet. Add and verify one under Payout methods.
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button size="sm" onClick={save} disabled={saving || selected === initial}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {saved && selected === initial && (
                <span className="text-xs text-success">Saved</span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
