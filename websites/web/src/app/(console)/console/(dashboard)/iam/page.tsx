"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  ArrowClockwise,
  Lock,
  Check,
  CircleNotch,
  ArrowCounterClockwise,
} from "@unifesto/unicon/react";
import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Card, CardContent, CardHeader, CardTitle } from "@/console/components/ui/card";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/console/components/ui/dialog";
import {
  getSpaceCapabilityMatrix,
  setSpaceCapabilityGrant,
  resetSpaceCapabilityRole,
  actionLabel,
  roleLabel,
  type SpaceCapabilityMatrix,
  type SpaceMatrixRole,
} from "@/console/lib/api/iam-api";

const cellKey = (code: string, action: string) => `${code}|${action}`;

export default function SpaceIamPage() {
  const spaceId = useSpaceId();
  const [matrix, setMatrix] = useState<SpaceCapabilityMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  /** A revoke awaiting confirmation. */
  const [confirm, setConfirm] = useState<{
    code: string;
    action: string;
  } | null>(null);
  /** A role reset awaiting confirmation. */
  const [resetRole, setResetRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    const { data, error } = await getSpaceCapabilityMatrix(spaceId);
    setLoading(false);
    if (error) {
      setError(error.message ?? "Failed to load the capability matrix.");
      return;
    }
    setError(null);
    setMatrix(data);
  }, [spaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const applyToggle = useCallback(
    async (code: string, action: string, granted: boolean) => {
      if (!spaceId) return;
      const key = cellKey(code, action);
      setPending((prev) => new Set(prev).add(key));
      const { data, error } = await setSpaceCapabilityGrant(spaceId, {
        code,
        action,
        granted,
      });
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (error) {
        setError(error.message ?? "Could not save that change.");
        return;
      }
      setError(null);
      if (data) setMatrix(data);
    },
    [spaceId]
  );

  const applyReset = useCallback(
    async (code: string) => {
      if (!spaceId) return;
      const { data, error } = await resetSpaceCapabilityRole(spaceId, code);
      if (error) {
        setError(error.message ?? "Could not reset that role.");
        return;
      }
      setError(null);
      if (data) setMatrix(data);
    },
    [spaceId]
  );

  const onCellClick = (code: string, action: string, granted: boolean) => {
    if (granted) setConfirm({ code, action });
    else applyToggle(code, action, true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="IAM"
        subtitle="Tune what your event roles can do in this space. Changes apply immediately and only within this space."
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <ArrowClockwise className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      {/* Space Admin — locked, like Platform Admin on the platform console. */}
      <Card className="rounded-2xl border border-primary/30 bg-primary-soft/30 px-4">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
            weight="fill"
          />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                Space Admin
              </span>
              <Badge variant="brand">
                <Lock className="mr-1 h-3 w-3" />
                Locked
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Full control of this space — always. Not editable here, so you can
              never accidentally lock yourself out.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !matrix ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Event roles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* The grid is wider than a phone; say so (B12). */}
            <p className="text-xs text-muted-foreground md:hidden">Scroll sideways to see every permission.</p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-muted-foreground">
                      Role
                    </th>
                    {matrix.actions.map((a) => (
                      <th
                        key={a.key}
                        className="px-3 py-2 text-center font-medium text-muted-foreground"
                      >
                        <span className="inline-flex items-center gap-1">
                          {actionLabel(a.key)}
                          {a.locked && (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {matrix.roles.map((role) => (
                    <RoleRow
                      key={role.code}
                      role={role}
                      actions={matrix.actions}
                      pending={pending}
                      onCellClick={onCellClick}
                      onReset={() => setResetRole(role.code)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              <Lock className="mr-1 inline h-3 w-3" />
              Locked columns are set by the platform: <em>Event money</em> stays
              platform-controlled, and <em>View event</em> is always on for every
              event role.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Revoke confirmation. */}
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke this permission?</DialogTitle>
            <DialogDescription>
              {confirm && (
                <>
                  <span className="font-medium text-foreground">
                    {roleLabel(confirm.code)}
                  </span>{" "}
                  will no longer be able to{" "}
                  <span className="font-medium text-foreground">
                    {actionLabel(confirm.action).toLowerCase()}
                  </span>{" "}
                  in this space.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm) applyToggle(confirm.code, confirm.action, false);
                setConfirm(null);
              }}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset-to-default confirmation. */}
      <Dialog
        open={resetRole !== null}
        onOpenChange={(open) => !open && setResetRole(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to platform default?</DialogTitle>
            <DialogDescription>
              {resetRole && (
                <>
                  <span className="font-medium text-foreground">
                    {roleLabel(resetRole)}
                  </span>{" "}
                  will drop this space&apos;s customisations and follow the
                  platform default again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetRole(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetRole) applyReset(resetRole);
                setResetRole(null);
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RoleRow({
  role,
  actions,
  pending,
  onCellClick,
  onReset,
}: {
  role: SpaceMatrixRole;
  actions: SpaceCapabilityMatrix["actions"];
  pending: Set<string>;
  onCellClick: (code: string, action: string, granted: boolean) => void;
  onReset: () => void;
}) {
  return (
    <tr className="border-t border-border">
      <td className="sticky left-0 z-10 bg-card px-3 py-2">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="font-medium text-foreground">
            {roleLabel(role.code)}
          </span>
          {role.customized && <Badge variant="brand">Customised</Badge>}
        </div>
      </td>
      {actions.map((a) => {
        const granted = role.grants.includes(a.key);
        const saving = pending.has(cellKey(role.code, a.key));
        return (
          <td key={a.key} className="px-3 py-2 text-center">
            <GrantCell
              granted={granted}
              editable={a.editable}
              saving={saving}
              label={`${granted ? "Revoke" : "Grant"} ${actionLabel(
                a.key
              )} for ${roleLabel(role.code)}`}
              onClick={() =>
                a.editable && onCellClick(role.code, a.key, granted)
              }
            />
          </td>
        );
      })}
      <td className="px-3 py-2 text-right">
        {role.customized && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            title="Reset to platform default"
          >
            <ArrowCounterClockwise className="h-4 w-4" />
            Reset
          </Button>
        )}
      </td>
    </tr>
  );
}

function GrantCell({
  granted,
  editable,
  saving,
  label,
  onClick,
}: {
  granted: boolean;
  editable: boolean;
  saving: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={granted}
      disabled={saving || !editable}
      onClick={onClick}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
        granted
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-transparent",
        editable && !saving
          ? granted
            ? "hover:bg-primary/90"
            : "hover:border-primary/50 hover:bg-muted"
          : "cursor-not-allowed opacity-70",
        saving ? "opacity-60" : "",
      ].join(" ")}
    >
      {saving ? (
        <CircleNotch className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <Check className="h-3.5 w-3.5" weight="bold" />
      )}
    </button>
  );
}
