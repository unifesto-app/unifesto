"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PaintBrush } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createWhiteLabelRequest,
  updateSpaceBranding,
  updateEventBranding,
  type SpaceWhiteLabelState,
  type WhiteLabelRequest,
} from "@/lib/api/white-label-api";

const DEFAULT_COLOR = "#3491ff";
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Organiser-facing white-label control for the space or one of its events.
 * White-label is colour-only: the organiser's accent replaces Unifesto blue on
 * the public page and in the app.
 *
 * State comes from the target row itself (`enabled`), not the request history:
 * an admin may have applied or removed white-label directly, and another
 * co-admin may have raised the request. The parent page owns the fetch and
 * passes the slice for this target; `onChanged` asks it to reload.
 */
export function WhiteLabelSection({
  spaceId,
  eventId,
  enabled,
  brandColor,
  latestRequest,
  planHasBranding,
  inheritedColor,
  surfaces,
  onChanged,
}: {
  spaceId: string;
  /** Omit for the space itself. */
  eventId?: string;
  enabled: boolean;
  brandColor: string | null;
  latestRequest: WhiteLabelRequest | null;
  planHasBranding: boolean;
  /** Event targets: the space's live accent, which the event already inherits. */
  inheritedColor?: string | null;
  /** Space target only: favicon + email sender. */
  surfaces?: Pick<
    SpaceWhiteLabelState,
    "faviconUrl" | "emailFromName" | "emailReplyTo"
  >;
  onChanged: () => void | Promise<void>;
}) {
  const scope = eventId ? "event" : "space";
  const pending = !enabled && latestRequest?.status === "PENDING";

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [color, setColor] = useState(
    brandColor ?? latestRequest?.brandColor ?? inheritedColor ?? DEFAULT_COLOR
  );
  const [reason, setReason] = useState("");
  const [faviconUrl, setFaviconUrl] = useState(surfaces?.faviconUrl ?? "");
  const [emailFromName, setEmailFromName] = useState(
    surfaces?.emailFromName ?? ""
  );
  const [emailReplyTo, setEmailReplyTo] = useState(
    surfaces?.emailReplyTo ?? ""
  );

  // Re-seed when the parent reloads fresh state for this target.
  useEffect(() => {
    setColor(
      brandColor ?? latestRequest?.brandColor ?? inheritedColor ?? DEFAULT_COLOR
    );
  }, [brandColor, latestRequest?.brandColor, inheritedColor]);
  useEffect(() => {
    setFaviconUrl(surfaces?.faviconUrl ?? "");
    setEmailFromName(surfaces?.emailFromName ?? "");
    setEmailReplyTo(surfaces?.emailReplyTo ?? "");
  }, [surfaces?.faviconUrl, surfaces?.emailFromName, surfaces?.emailReplyTo]);

  const colorValid = HEX.test(color);

  const submitRequest = async () => {
    setBusy(true);
    setError("");
    const { error } = await createWhiteLabelRequest({
      spaceId,
      eventId,
      brandColor: color,
      reason: reason.trim() || `Requesting white-label for this ${scope}.`,
    });
    if (error) setError(error.message);
    else {
      setReason("");
      await onChanged();
    }
    setBusy(false);
  };

  const saveBranding = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    const patch = {
      brandColor: color,
      // Space-only surfaces: omit blank fields so they're left unchanged.
      ...(eventId
        ? {}
        : {
            faviconUrl: faviconUrl.trim() || undefined,
            emailFromName: emailFromName.trim() || undefined,
            emailReplyTo: emailReplyTo.trim() || undefined,
          }),
    };
    const { error } = eventId
      ? await updateEventBranding(eventId, patch)
      : await updateSpaceBranding(spaceId, patch);
    if (error) setError(error.message);
    else {
      setSaved(true);
      await onChanged();
    }
    setBusy(false);
  };

  const badge = enabled
    ? { label: "On", variant: "success" as const }
    : pending
      ? { label: "Pending review", variant: "warning" as const }
      : latestRequest?.status === "REJECTED"
        ? { label: "Declined", variant: "destructive" as const }
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PaintBrush className="h-4 w-4" />
          {eventId ? "Event accent colour" : "Space accent colour"}
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
        </CardTitle>
        <CardDescription>
          {eventId
            ? "Give this event its own accent colour on its public page and in the app."
            : "Your accent colour replaces Unifesto blue on your public space page, every event under it, and in the app."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}

        {!enabled && !pending && !planHasBranding ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-foreground">
              White-label isn&rsquo;t included in this space&rsquo;s plan.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/billing">See plans</Link>
            </Button>
          </div>
        ) : (
          <>
            {eventId && !enabled && inheritedColor && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: inheritedColor }}
                />
                Already uses your space colour. Request only if this event
                needs a different one.
              </p>
            )}

            <div className="max-w-sm space-y-1.5">
              <Label htmlFor={`wl-color-${eventId ?? "space"}`}>
                Accent colour
              </Label>
              <div className="flex items-center gap-2">
                <input
                  id={`wl-color-${eventId ?? "space"}`}
                  type="color"
                  value={colorValid ? color : DEFAULT_COLOR}
                  onChange={(e) => setColor(e.target.value)}
                  disabled={pending}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-1 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value.trim())}
                  disabled={pending}
                  placeholder={DEFAULT_COLOR}
                  className="font-mono"
                  aria-invalid={!colorValid}
                />
              </div>
              {!colorValid && (
                <p className="text-xs text-destructive">
                  Use a 6-digit hex colour, like #7a5af8.
                </p>
              )}
            </div>

            {/* Space-only surfaces: favicon + custom email sender. */}
            {enabled && !eventId && (
              <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Advanced branding
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Applied across your public space and event pages, and on the
                    confirmation emails your attendees receive.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-favicon">Favicon URL</Label>
                  <Input
                    id="wl-favicon"
                    value={faviconUrl}
                    onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="https://…/favicon.png"
                  />
                  <p className="text-xs text-muted-foreground">
                    The tab icon on your public pages.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-from">Email sender name</Label>
                    <Input
                      id="wl-from"
                      value={emailFromName}
                      onChange={(e) => setEmailFromName(e.target.value)}
                      placeholder="Your organisation"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown as the sender on confirmation emails.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wl-replyto">Reply-to email</Label>
                    <Input
                      id="wl-replyto"
                      type="email"
                      value={emailReplyTo}
                      onChange={(e) => setEmailReplyTo(e.target.value)}
                      placeholder="hello@yourorg.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Where attendee replies should go.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {enabled ? (
              <div className="flex items-center gap-3">
                <Button onClick={saveBranding} disabled={busy || !colorValid}>
                  {busy ? "Saving…" : "Save"}
                </Button>
                {saved && (
                  <span className="text-sm text-muted-foreground">Saved.</span>
                )}
              </div>
            ) : pending ? (
              <p className="text-sm text-muted-foreground">
                Awaiting admin review
                {latestRequest?.requester?.fullName
                  ? ` (requested by ${latestRequest.requester.fullName})`
                  : ""}
                . You can change the colour any time once it&rsquo;s approved.
              </p>
            ) : (
              <div className="space-y-3">
                {latestRequest?.status === "REJECTED" &&
                  latestRequest.reviewNote && (
                    <p className="text-sm italic text-muted-foreground">
                      Last request declined: {latestRequest.reviewNote}
                    </p>
                  )}
                <div className="space-y-1.5">
                  <Label htmlFor={`wl-reason-${eventId ?? "space"}`}>
                    Note for the admin (optional)
                  </Label>
                  <Textarea
                    id={`wl-reason-${eventId ?? "space"}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Anything the admin should know."
                    rows={2}
                  />
                </div>
                <Button onClick={submitRequest} disabled={busy || !colorValid}>
                  {busy ? "Sending…" : "Request white-label"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
