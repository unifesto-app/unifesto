"use client";

import { AuditTrail } from "@/components/shared/AuditTrail";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  ArrowClockwise,
  ArrowSquareOut,
  Lock,
  Check,
  CircleNotch,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCapabilityMatrix,
  setCapabilityGrant,
  actionLabel,
  roleLabel,
  SCOPE_LABELS,
  type CapabilityMatrix,
  type MatrixRole,
  type RoleScope,
} from "@/lib/api/iam-api";

/**
 * The editable scopes, in display order. ADMIN is shown separately; PLATFORM
 * holds the Employee row (cells in `role.locked` render as locked).
 */
const EDITABLE_SCOPES: RoleScope[] = ["PLATFORM", "SPACE", "EVENT"];

const cellKey = (code: string, action: string) => `${code}|${action}`;

export default function IamPage() {
  const [matrix, setMatrix] = useState<CapabilityMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Cells currently being saved, keyed by `${code}|${action}`. */
  const [pending, setPending] = useState<Set<string>>(new Set());
  /** A revoke awaiting confirmation (removing access is the risky direction). */
  const [confirm, setConfirm] = useState<{
    code: string;
    action: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getCapabilityMatrix();
    setLoading(false);
    if (error) {
      setError(error.message ?? "Failed to load the capability matrix.");
      return;
    }
    setError(null);
    setMatrix(data);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const applyToggle = useCallback(
    async (code: string, action: string, granted: boolean) => {
      const key = cellKey(code, action);
      setPending((prev) => new Set(prev).add(key));
      const { data, error } = await setCapabilityGrant({ code, action, granted });
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
    []
  );

  const onCellClick = (role: MatrixRole, action: string, granted: boolean) => {
    if (!role.editable || role.locked?.includes(action)) return;
    if (granted) {
      // Revoking access — confirm first.
      setConfirm({ code: role.code, action });
    } else if (window.confirm(`Grant "${action}" to ${role.code}? It applies everywhere at once.`)) {
      applyToggle(role.code, action, true);
    }
  };

  const adminRole = matrix?.roles.find((r) => !r.editable) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="IAM"
        subtitle="Manage which roles can perform which actions across the platform. Changes take effect immediately."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
          >
            <ArrowClockwise className="h-4 w-4" />
            Refresh
          </Button>
        }
      />

      {error && <ErrorNotice message={error} />}

      <Tabs defaultValue="capabilities">
        <TabsList>
          <TabsTrigger value="capabilities">Roles &amp; Capabilities</TabsTrigger>
          <TabsTrigger value="features">Plan Features</TabsTrigger>
        </TabsList>

        {/* ---------------------- Roles & Capabilities ---------------------- */}
        <TabsContent value="capabilities" className="space-y-6">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : !matrix ? null : (
            <>
              {/* Platform Admin — locked superuser. */}
              {adminRole && (
                <Card className="rounded-lg border border-primary/30 bg-primary-soft/30 px-4">
                  <CardContent className="flex items-start gap-3 py-4">
                    <ShieldCheck
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
                      weight="fill"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {roleLabel(adminRole.code)}
                        </span>
                        <Badge variant="brand">
                          <Lock className="mr-1 h-3 w-3" />
                          Locked
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {adminRole.note}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {EDITABLE_SCOPES.map((scope) => (
                <ScopeMatrix
                  key={scope}
                  scope={scope}
                  matrix={matrix}
                  pending={pending}
                  onCellClick={onCellClick}
                />
              ))}
              <AuditTrail filter={{ action: "iam." }} />
            </>
          )}
        </TabsContent>

        {/* ------------------------- Plan Features -------------------------- */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Plan features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Which product features each plan unlocks — waitlists, analytics,
                sessions, certificates, remove-branding and the rest — is managed
                per plan on the Plans page. Editing happens there so there is a
                single source of truth for plan definitions.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/plans">
                  Open Plans
                  <ArrowSquareOut className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
                  </span>
                  . Anyone holding this role loses that access immediately.
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
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** One scope's grid: editable roles (rows) × that scope's actions (columns). */
function ScopeMatrix({
  scope,
  matrix,
  pending,
  onCellClick,
}: {
  scope: RoleScope;
  matrix: CapabilityMatrix;
  pending: Set<string>;
  onCellClick: (role: MatrixRole, action: string, granted: boolean) => void;
}) {
  const actions = matrix.actions.filter((a) => a.scope === scope);
  const roles = matrix.roles.filter((r) => r.scope === scope && r.editable);

  if (roles.length === 0 || actions.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{SCOPE_LABELS[scope]} roles</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-muted-foreground">
                  Role
                </th>
                {actions.map((a) => (
                  <th
                    key={a.key}
                    className="px-3 py-2 text-center font-medium text-muted-foreground"
                  >
                    {actionLabel(a.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.code} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <span className="whitespace-nowrap font-medium text-foreground">
                      {roleLabel(role.code)}
                    </span>
                  </td>
                  {actions.map((a) => {
                    const granted = role.grants.includes(a.key);
                    const saving = pending.has(cellKey(role.code, a.key));
                    if (role.locked?.includes(a.key)) {
                      return (
                        <td key={a.key} className="px-3 py-2 text-center">
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
                            title={`${actionLabel(a.key)} can never be granted to ${roleLabel(role.code)}`}
                            aria-label={`${actionLabel(a.key)}: locked for ${roleLabel(role.code)}`}
                          >
                            <Lock className="h-3.5 w-3.5" />
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={a.key} className="px-3 py-2 text-center">
                        <GrantCell
                          granted={granted}
                          saving={saving}
                          label={`${granted ? "Revoke" : "Grant"} ${actionLabel(
                            a.key
                          )} for ${roleLabel(role.code)}`}
                          onClick={() => onCellClick(role, a.key, granted)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

/** A single togglable permission cell. */
function GrantCell({
  granted,
  saving,
  label,
  onClick,
}: {
  granted: boolean;
  saving: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={granted}
      disabled={saving}
      onClick={onClick}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-md border transition-colors",
        granted
          ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
          : "border-border bg-card text-transparent hover:border-primary/50 hover:bg-muted",
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
