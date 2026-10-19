"use client";

import { inr } from "@/lib/utils/money";
import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  VideoCamera,
  Copy,
  Broadcast,
  XCircle,
  LinkSimple,
  Record as RecordIcon,
  Stop,
  Trash,
  EyeSlash,
  ArrowCounterClockwise,
  PencilSimple,
} from "@unifesto/unicon/react";
import {
  getSpaceSessionById,
  getSessionAttendees,
  getSessionCoHosts,
  addSessionCoHost,
  removeSessionCoHost,
  type SessionCoHost,
  publishSession,
  completeSession,
  deleteSession,
  hideSession,
  restoreSession,
  cancelSession,
  duplicateSession,
  addSessionRecording,
  startSessionRecording,
  stopSessionRecording,
  isLivePlatform,
  PLATFORM_LABELS,
  type Session,
  type SessionAttendee,
} from "@/lib/api/sessions-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function formatWhen(iso: string, timezone: string) {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  });
}

const PUBLIC_WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "https://www.unifesto.app";

export default function ManageSessionPage() {
  const params = useParams();
  const router = useRouter();
  const spaceId = useSpaceId();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [attendees, setAttendees] = useState<SessionAttendee[]>([]);
  const [coHosts, setCoHosts] = useState<SessionCoHost[]>([]);
  const [coHostEmail, setCoHostEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [endOpen, setEndOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s, error: sErr }, { data: a }, { data: c }] =
      await Promise.all([
        getSpaceSessionById(spaceId, sessionId),
        getSessionAttendees(sessionId),
        getSessionCoHosts(sessionId),
      ]);
    if (sErr) setError(sErr.message);
    else if (!s) setError("Session not found.");
    else {
      setSession(s);
      setRecordingUrl(s.recordingUrl ?? "");
    }
    setAttendees(a ?? []);
    setCoHosts(c ?? []);
    setLoading(false);
  }, [spaceId, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handlePublish() {
    setBusy(true);
    setError("");
    const { error } = await publishSession(sessionId);
    setBusy(false);
    if (error) setError(error.message);
    else void load();
  }

  async function handleToggleRecording() {
    if (!session) return;
    setBusy(true);
    setError("");
    const { error } = session.recordingEgressId
      ? await stopSessionRecording(sessionId)
      : await startSessionRecording(sessionId);
    setBusy(false);
    if (error) setError(error.message);
    else void load();
  }

  async function handleComplete() {
    setBusy(true);
    setError("");
    const { error } = await completeSession(sessionId);
    setBusy(false);
    setEndOpen(false);
    if (error) setError(error.message);
    else void load();
  }

  async function handleHide() {
    setBusy(true);
    setError("");
    const { error } = await hideSession(sessionId);
    setBusy(false);
    setHideOpen(false);
    if (error) setError(error.message);
    // Stay put rather than redirecting — hiding is reversible, and Restore
    // belongs right where Hide was.
    else void load();
  }

  async function handleRestore() {
    setBusy(true);
    setError("");
    const { error } = await restoreSession(sessionId);
    setBusy(false);
    if (error) setError(error.message);
    else void load();
  }

  async function handleDelete() {
    setBusy(true);
    setError("");
    const { error } = await deleteSession(sessionId);
    if (error) {
      setBusy(false);
      setDeleteOpen(false);
      setError(error.message);
      return;
    }
    router.push(`/dashboard/sessions`);
  }

  async function handleDuplicate() {
    setBusy(true);
    setError("");
    const { data, error } = await duplicateSession(sessionId);
    setBusy(false);
    if (error) setError(error.message);
    else router.push(`/dashboard/sessions/${data!.id}`);
  }

  async function handleCancel() {
    setBusy(true);
    setError("");
    const { data, error } = await cancelSession(
      sessionId,
      cancelReason.trim() || undefined
    );
    setBusy(false);
    setCancelOpen(false);
    if (error) setError(error.message);
    else {
      if (data && data.totalPaid > 0) {
        setError(
          `Cancelled. Refunded ${data.refunded}/${data.totalPaid} paid attendees.`
        );
      }
      void load();
    }
  }

  async function handleSaveRecording() {
    setBusy(true);
    setError("");
    const { error } = await addSessionRecording(sessionId, recordingUrl.trim());
    setBusy(false);
    if (error) setError(error.message);
    else void load();
  }

  async function handleAddCoHost() {
    const email = coHostEmail.trim();
    if (!email) return;
    setBusy(true);
    setError("");
    const { data, error } = await addSessionCoHost(sessionId, email);
    setBusy(false);
    if (error) setError(error.message);
    else {
      setCoHosts(data ?? []);
      setCoHostEmail("");
    }
  }

  async function handleRemoveCoHost(coHostUserId: string) {
    setBusy(true);
    setError("");
    const { data, error } = await removeSessionCoHost(sessionId, coHostUserId);
    setBusy(false);
    if (error) setError(error.message);
    else setCoHosts(data ?? []);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Card className="h-24 animate-pulse bg-muted" />
        <Card className="h-64 animate-pulse bg-muted" />
      </div>
    );
  }

  if (!session) {
    return <ErrorNotice message={error || "Session not found."} />;
  }

  const price = Number(session.price);
  const canPublish = session.status === "DRAFT";
  const canCancel =
    session.status === "DRAFT" || session.status === "PUBLISHED";
  const isLive = isLivePlatform(session.platform);
  // A room only exists while PUBLISHED — hosting, recording and ending a
  // session are all gated to that window (not DRAFT, COMPLETED or CANCELLED).
  const isRunning = session.status === "PUBLISHED";
  const isEnded =
    session.status === "COMPLETED" || session.status === "CANCELLED";
  const isHidden = Boolean(session.deletedAt);
  // Hiding is for sessions that are over: it destroys nothing, so all that
  // matters is that nobody still depends on the session being visible.
  const canHide = isEnded && !isHidden;
  // Permanent deletion is refused once a session has completed — it happened,
  // people attended and paid. Drafts and cancelled sessions can still go.
  const canDeleteForever =
    session.status === "DRAFT" || session.status === "CANCELLED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.title}
        subtitle={`${session.registeredCount} registered${
          session.capacity ? ` · ${session.capacity} capacity` : ""
        }`}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/sessions`)}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={session.status} />
        <span className="text-sm text-muted-foreground">
          {price > 0 ? inr(price) : "Free"}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {isLive && isRunning && (
          <Button
            onClick={() =>
              router.push(`/dashboard/sessions/${sessionId}/live`)
            }
            disabled={busy}
          >
            <VideoCamera className="h-4 w-4" weight="bold" />
            Go live
          </Button>
        )}
        {isLive &&
          isRunning &&
          (session.recordingEgressId ? (
            <Button
              variant="outline"
              onClick={handleToggleRecording}
              disabled={busy}
              className="text-destructive"
            >
              <Stop className="h-4 w-4" weight="fill" />
              Stop recording
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleToggleRecording}
              disabled={busy}
            >
              <RecordIcon className="h-4 w-4" />
              Record
            </Button>
          ))}
        {canPublish && (
          <Button onClick={handlePublish} disabled={busy}>
            <Broadcast className="h-4 w-4" weight="bold" />
            Publish
          </Button>
        )}
        {isRunning && (
          <Button
            variant="outline"
            onClick={() => setEndOpen(true)}
            disabled={busy}
          >
            <Stop className="h-4 w-4" weight="fill" />
            End session
          </Button>
        )}
        {canCancel && (
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/sessions/${sessionId}/edit`)}
            disabled={busy}
          >
            <PencilSimple className="h-4 w-4" />
            Edit
          </Button>
        )}
        {session.status !== "DRAFT" && (
          // The public page (B18): share it anywhere; it opens the app's
          // session screen on phones that have the app.
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard?.writeText(`${PUBLIC_WEB_URL}/session/${session.slug}`).catch(() => undefined);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
          >
            <LinkSimple className="h-4 w-4" />
            {linkCopied ? "Link copied" : "Copy public link"}
          </Button>
        )}
        <Button variant="outline" onClick={handleDuplicate} disabled={busy}>
          <Copy className="h-4 w-4" />
          Duplicate
        </Button>
        {canCancel && (
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            disabled={busy}
            className="text-destructive"
          >
            <XCircle className="h-4 w-4" />
            Cancel session
          </Button>
        )}
        {canHide && (
          <Button
            variant="outline"
            onClick={() => setHideOpen(true)}
            disabled={busy}
          >
            <EyeSlash className="h-4 w-4" />
            Hide
          </Button>
        )}
        {isHidden && (
          <Button onClick={handleRestore} disabled={busy}>
            <ArrowCounterClockwise className="h-4 w-4" />
            Restore
          </Button>
        )}
        {canDeleteForever && (
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
            className="text-destructive"
          >
            <Trash className="h-4 w-4" />
            Delete permanently
          </Button>
        )}
      </div>

      {isHidden && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This session is hidden. It does not appear in listings or in
          attendees&apos; lists. Its registrations, payments and recording are
          all still here, and restoring puts everything back.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>
              {formatWhen(session.startDateTime, session.timezone)} ·{" "}
              {session.durationMinutes} min
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <VideoCamera className="h-4 w-4" />
            <span>
              {session.platform === "OTHER"
                ? session.platformOther || "Online"
                : PLATFORM_LABELS[session.platform]}
            </span>
          </div>
          {isLivePlatform(session.platform) ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <LinkSimple className="h-4 w-4" />
              <span>
                Hosted in-app — no shareable link. Attendees join with a
                personal pass; use “Go live” to open the room.
              </span>
            </div>
          ) : (
            session.meetingUrl && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <LinkSimple className="h-4 w-4" />
                <a
                  href={session.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {session.meetingUrl}
                </a>
              </div>
            )
          )}
          {session.description && (
            <p className="whitespace-pre-wrap pt-2 text-foreground">
              {session.description}
            </p>
          )}
        </CardContent>
      </Card>

      {session.status === "COMPLETED" && (
        <Card>
          <CardHeader>
            <CardTitle>Recording</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLive ? (
              // In-app sessions record automatically (LiveKit Egress → storage);
              // the link is filled in for you — nothing to paste.
              session.recordingUrl ? (
                <div className="space-y-1">
                  <a
                    href={session.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Watch recording
                  </a>
                  <p className="break-all text-xs text-muted-foreground">
                    {session.recordingUrl}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recording. In-app sessions are recorded only if you press
                  Record during the live session; if you did, it can take a few
                  minutes to process and appear here.
                </p>
              )
            ) : (
              // External platforms (Meet/Zoom/Teams): paste a link to share.
              <div className="space-y-2">
                <Label htmlFor="recording">Recording link</Label>
                <p className="text-xs text-muted-foreground">
                  Hosted a recording elsewhere? Paste a link (YouTube, Drive,
                  etc.) to share it with attendees.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="recording"
                    value={recordingUrl}
                    onChange={(e) => setRecordingUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <Button
                    onClick={handleSaveRecording}
                    disabled={busy || !recordingUrl.trim()}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isLive && !isEnded && (
        <Card>
          <CardHeader>
            <CardTitle>Co-hosts ({coHosts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Co-hosts join with host controls (camera, screen share, ending the
              room) and don’t need to register. Add an existing Unifesto user by
              the email on their account.
            </p>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 space-y-1" style={{ minWidth: 220 }}>
                <Label htmlFor="cohost-email">Add co-host by email</Label>
                <Input
                  id="cohost-email"
                  type="email"
                  value={coHostEmail}
                  onChange={(e) => setCoHostEmail(e.target.value)}
                  placeholder="guest@example.com"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleAddCoHost();
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleAddCoHost}
                disabled={busy || !coHostEmail.trim()}
              >
                Add
              </Button>
            </div>

            {coHosts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No co-hosts yet.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {coHosts.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.fullName || c.username || c.email || "Unifesto user"}
                      </p>
                      {c.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {c.email}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveCoHost(c.userId)}
                      disabled={busy}
                      className="text-destructive"
                    >
                      <Trash className="h-4 w-4" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attendees ({attendees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {attendees.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No registrations yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Payment</th>
                    <th className="py-2 pr-4 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((a) => (
                    <tr key={a.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        {a.user.fullName || a.user.username || "—"}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {a.user.email || "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={a.paymentStatus} />
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {a.joinedAt ? "Yes" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>
              Every paid attendee will be automatically refunded. This can’t be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (shown to attendees)</Label>
            <Textarea
              id="reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Speaker unavailable — we’ll reschedule."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep session
            </Button>
            <Button
              onClick={handleCancel}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Cancelling…" : "Cancel & refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={endOpen} onOpenChange={setEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this session?</DialogTitle>
            <DialogDescription>
              This marks the session complete, closes the live room for everyone,
              and stops any recording. It can’t be undone. No refunds are issued.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndOpen(false)}>
              Keep it running
            </Button>
            <Button onClick={handleComplete} disabled={busy}>
              {busy ? "Ending…" : "End session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={hideOpen} onOpenChange={setHideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hide this session?</DialogTitle>
            <DialogDescription>
              It disappears from listings and from attendees&apos; lists.
              Nothing is deleted — registrations, payments and any recording are
              kept, and restoring brings all of it back exactly as it is now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHideOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleHide} disabled={busy}>
              {busy ? "Hiding…" : "Hide session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {session.status === "DRAFT"
                ? "Delete this draft?"
                : "Delete this session permanently?"}
            </DialogTitle>
            <DialogDescription>
              {session.status === "DRAFT"
                ? "This permanently removes the draft session. It was never published, so no one is registered and nothing is refunded. This can’t be undone."
                : "This permanently removes the session and everything attached to it. It was cancelled, so attendees have already been refunded. This can’t be undone — hide it instead if you only want it out of the way."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Keep it
            </Button>
            <Button
              onClick={handleDelete}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
