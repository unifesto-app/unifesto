"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash, PaperPlaneTilt } from "@unifesto/unicon/react";
import {
  listSponsorUsers,
  inviteSponsorUser,
  revokeSponsorUser,
  type Sponsor,
  type SponsorUser,
} from "@/lib/api/sponsors-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Manage who can sign in to a sponsor's portal (P5). Invite by the email on a
 * person's Unifesto account; they land in the /sponsor surface on next sign-in.
 * INVITED flips to ACTIVE once they actually open the portal.
 */
export function SponsorUsersDialog({
  spaceId,
  sponsor,
  open,
  onOpenChange,
}: {
  spaceId: string;
  sponsor: Sponsor | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [users, setUsers] = useState<SponsorUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sponsor) return;
    setLoading(true);
    const { data } = await listSponsorUsers(spaceId, sponsor.id);
    setUsers(data ?? []);
    setLoading(false);
  }, [spaceId, sponsor]);

  useEffect(() => {
    if (open) {
      setEmail("");
      setError(null);
      load();
    }
  }, [open, load]);

  const invite = async () => {
    if (!sponsor || !email.trim()) return;
    setInviting(true);
    setError(null);
    const { error } = await inviteSponsorUser(spaceId, sponsor.id, email.trim());
    setInviting(false);
    if (error) {
      setError(error.message ?? "Could not send the invite.");
      return;
    }
    setEmail("");
    load();
  };

  const revoke = async (u: SponsorUser) => {
    if (!sponsor) return;
    if (!window.confirm("Revoke this person's access to the sponsor portal?")) return;
    const { error } = await revokeSponsorUser(spaceId, sponsor.id, u.id);
    if (error) setError(error.message ?? "Could not revoke access.");
    else setUsers((prev) => prev.filter((x) => x.id !== u.id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Portal access · {sponsor?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label id="sponsorusersdialog-invite-by-email-label">Invite by email</Label>
            <div role="group" aria-labelledby="sponsorusersdialog-invite-by-email-label" className="flex gap-2">
              <Input
                type="email"
                placeholder="person@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
              />
              <Button onClick={invite} disabled={inviting || !email.trim()}>
                <PaperPlaneTilt className="h-4 w-4" />
                {inviting ? "…" : "Invite"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The person must already have a Unifesto account with this email.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            {loading ? (
              <Skeleton className="h-16 rounded-lg" />
            ) : users.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one has portal access yet.</p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.user.fullName ?? u.invitedEmail ?? "Invited"}
                    </p>
                    {u.invitedEmail && (
                      <p className="truncate text-xs text-muted-foreground">{u.invitedEmail}</p>
                    )}
                  </div>
                  <Badge variant={u.status === "ACTIVE" ? "success" : "neutral"}>
                    {u.status === "ACTIVE" ? "Active" : "Invited"}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => revoke(u)} aria-label="Revoke">
                    <Trash className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
