"use client";

import { useState } from "react";
import { Trash } from "@unifesto/unicon/react";
import {
  forceLogout,
  liftSuspension,
  removeCapabilityOverride,
  setCapabilityOverride,
  suspendUser,
  type UserDetail,
} from "@/lib/api/admin-users-api";
import { ACTION_LABELS, actionLabel } from "@/lib/api/iam-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmDialog } from "@/components/shared/ConfirmDialog";

const selectClass = "h-9 rounded-md border bg-background px-2 text-sm";

function fmt(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * F4 user IAM: suspend (with an end date) or ban (without), sign out of every
 * device, and per-user capability overrides on top of the user's roles.
 */
export function AccountAccessCard({ user, onChanged }: { user: UserDetail; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");

  const [action, setAction] = useState("");
  const [allow, setAllow] = useState(false);
  const [spaceId, setSpaceId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const active =
    !!user.suspendedAt && (!user.suspendedUntil || new Date(user.suspendedUntil) > new Date());
  // Spaces this user holds a role in: the places an override usually targets.
  const spaces = [
    ...new Map(
      user.roles.filter((r) => r.spaceId).map((r) => [r.spaceId!, r.spaceName ?? r.spaceId!])
    ),
  ];

  const run = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error } = await fn();
    setBusy(false);
    if (error) {
      setError(error.message);
      return false;
    }
    onChanged();
    return true;
  };

  const suspend = async (ban: boolean) => {
    if (reason.trim().length < 3) return setError("Add a reason first.");
    if (!ban && !until) return setError("Pick the date the suspension ends.");
    const ok = await confirmDialog({
      title: ban ? "Ban this account?" : `Suspend until ${fmt(until)}?`,
      description: "They are signed out of every device and can't sign in until this is lifted.",
      confirmLabel: ban ? "Ban" : "Suspend",
      destructive: true,
    });
    if (!ok) return;
    const end = ban ? null : new Date(`${until}T23:59:59+05:30`).toISOString();
    if (await run(() => suspendUser(user.id, reason.trim(), end))) {
      setReason("");
      setUntil("");
    }
  };

  const signOut = async () => {
    const ok = await confirmDialog({
      title: "Sign out of every device?",
      description: "Every session ends now. They can sign straight back in.",
      confirmLabel: "Sign out",
    });
    if (ok) await run(() => forceLogout(user.id));
  };

  const addOverride = async () => {
    if (!action) return setError("Pick an action.");
    if (allow && !spaceId) return setError("A grant needs a space.");
    if (
      await run(() =>
        setCapabilityOverride(user.id, {
          action,
          allow,
          spaceId: spaceId || null,
          reason: overrideReason.trim() || undefined,
        })
      )
    ) {
      setAction("");
      setOverrideReason("");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
        <CardTitle className="text-base">Account access</CardTitle>
        <Button size="sm" variant="outline" onClick={() => void signOut()} disabled={busy}>
          Sign out everywhere
        </Button>
      </CardHeader>
      <CardContent className="space-y-5 pt-2">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive-soft p-3">
            <div className="min-w-0 text-sm">
              <Badge variant="destructive">
                {user.suspendedUntil ? `Suspended until ${fmt(user.suspendedUntil)}` : "Banned"}
              </Badge>
              {user.suspensionReason && (
                <p className="mt-1.5 text-foreground">{user.suspensionReason}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => liftSuspension(user.id))}
            >
              Lift
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-56 flex-1 gap-1 text-sm">
              <span className="text-muted-foreground">Reason</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Suspend until</span>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void suspend(false)}>
              Suspend
            </Button>
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void suspend(true)}>
              Ban
            </Button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Capability overrides
          </p>
          <p className="text-sm text-muted-foreground">
            On top of their roles. A removal wins over everything; a grant applies in one space.
          </p>
          {user.capabilityOverrides.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border">
              {user.capabilityOverrides.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Badge variant={o.allow ? "success" : "destructive"}>
                      {o.allow ? "Grant" : "Remove"}
                    </Badge>{" "}
                    <span className="font-medium">{actionLabel(o.action)}</span>
                    <span className="text-muted-foreground"> · {o.space?.name ?? "Every space"}</span>
                    {o.reason && <p className="truncate text-xs text-muted-foreground">{o.reason}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Remove override"
                    disabled={busy}
                    onClick={() => void run(() => removeCapabilityOverride(user.id, o.id))}
                  >
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <select
              className={selectClass}
              value={allow ? "grant" : "remove"}
              onChange={(e) => setAllow(e.target.value === "grant")}
              aria-label="Grant or remove"
            >
              <option value="remove">Remove</option>
              <option value="grant">Grant</option>
            </select>
            <select
              className={selectClass}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              aria-label="Action"
            >
              <option value="">Action</option>
              {Object.keys(ACTION_LABELS)
                .filter((k) => !allow || !/^(platform|company|product):/.test(k))
                .map((k) => (
                  <option key={k} value={k}>
                    {actionLabel(k)}
                  </option>
                ))}
            </select>
            <select
              className={selectClass}
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value)}
              aria-label="Space"
            >
              <option value="">Every space</option>
              {spaces.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <Input
              className="min-w-40 flex-1"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason (optional)"
            />
            <Button size="sm" disabled={busy} onClick={() => void addOverride()}>
              Add
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
