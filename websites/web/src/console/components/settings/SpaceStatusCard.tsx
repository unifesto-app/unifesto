"use client";

import { useCallback, useEffect, useState } from "react";
import {
  askSpaceBack,
  getSpaceLifecycle,
  setSpaceLifecycle,
  type SpaceLifecycle,
} from "@/console/lib/api/spaces-api";
import { confirmDialog } from "@/console/components/shared/ConfirmDialog";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Button } from "@/console/components/ui/button";
import { Textarea } from "@/console/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/** What the status means, and who set it. Plain text, no badge. */
function describe(l: SpaceLifecycle): { label: string; tone: string; line: string } {
  const since = l.changedAt ? ` since ${day(l.changedAt)}` : "";
  switch (l.status) {
    case "INACTIVE":
      return {
        label: "Paused",
        tone: "text-muted-foreground",
        line: `Paused${since}${l.changedBy === "platform" ? " by Unifesto" : ""}. Hidden and not selling. Tickets already sold still check in.`,
      };
    case "SUSPENDED":
      return { label: "Suspended", tone: "text-destructive", line: `Suspended by Unifesto${since}. Hidden and not selling.` };
    case "ARCHIVED":
      return {
        label: "Archived",
        tone: "text-muted-foreground",
        line:
          l.changedBy === "system"
            ? `Archived${since} after 180 days with no events.`
            : l.changedBy === "owner"
              ? `Archived${since}.`
              : `Archived by Unifesto${since}.`,
      };
    default:
      return { label: "Live", tone: "text-success", line: "Anyone can find it and buy tickets." };
  }
}

/**
 * Q39: the owner pauses, resumes, archives or restores the space here, with no
 * review. A suspension, or an archive by Unifesto, comes back through a
 * request the team reviews in Assist.
 */
export function SpaceStatusCard({ spaceId, onChange }: { spaceId: string; onChange: () => void }) {
  const [life, setLife] = useState<SpaceLifecycle | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState("");

  const load = useCallback(async () => {
    const { data, error: err } = await getSpaceLifecycle(spaceId);
    if (err) setError(err.message);
    else setLife(data);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!life) return error ? <ErrorNotice message={error} /> : null;

  const { label, tone, line } = describe(life);
  const openMoney = life.openPayouts + life.openRefunds;
  const askBack = life.status === "SUSPENDED" || (life.status === "ARCHIVED" && !life.canRestore);

  const set = async (status: "ACTIVE" | "INACTIVE" | "ARCHIVED") => {
    setBusy(true);
    setError("");
    const { data, error: err } = await setSpaceLifecycle(spaceId, status);
    setBusy(false);
    if (err) return setError(err.message);
    setLife(data);
    onChange();
  };

  const pause = async () => {
    const sold = life.upcomingTicketsSold;
    const ok = await confirmDialog({
      title: "Pause this space?",
      description: sold
        ? `${sold} ${sold === 1 ? "ticket is" : "tickets are"} sold for upcoming events. They still check in, but nobody can buy new ones until you resume.`
        : "It is hidden and stops selling until you resume. You can resume any time.",
      confirmLabel: "Pause space",
      destructive: true,
    });
    if (ok) await set("INACTIVE");
  };

  const archive = async () => {
    const ok = await confirmDialog({
      title: "Archive this space?",
      description: "It is closed and hidden. You can restore it any time from here.",
      confirmLabel: "Archive space",
      destructive: true,
    });
    if (ok) await set("ARCHIVED");
  };

  const sendAsk = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await askSpaceBack(spaceId, why.trim());
    setBusy(false);
    if (err) return setError(err.message);
    setWhy("");
    await load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Space status</CardTitle>
        <CardDescription>
          <span className={`font-medium ${tone}`}>{label}.</span> {line}
          {life.reason && <> Reason: {life.reason}</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorNotice message={error} />}

        {!life.isOwner ? (
          <p className="text-sm text-muted-foreground">Only the space owner can change this.</p>
        ) : askBack ? (
          life.pendingRequest ? (
            <p className="text-sm text-muted-foreground">
              Request sent {day(life.pendingRequest.createdAt)}. The team replies in Assist.
            </p>
          ) : (
            <div className="space-y-3">
              <Textarea
                placeholder={
                  life.status === "SUSPENDED"
                    ? "What changed? Tell the team why it should come back."
                    : "Why should it come back?"
                }
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                maxLength={1000}
                disabled={busy}
              />
              <Button onClick={sendAsk} disabled={busy || !why.trim()}>
                {life.status === "SUSPENDED" ? "Send appeal" : "Ask to restore"}
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {life.status === "ACTIVE" && (
              <Button variant="outline" onClick={pause} disabled={busy}>
                Pause space
              </Button>
            )}
            {life.status === "INACTIVE" && (
              <Button onClick={() => set("ACTIVE")} disabled={busy}>
                Resume space
              </Button>
            )}
            {life.status === "ARCHIVED" && (
              <Button onClick={() => set("ACTIVE")} disabled={busy}>
                Restore space
              </Button>
            )}
            {(life.status === "ACTIVE" || life.status === "INACTIVE") && (
              <Button variant="ghost" onClick={archive} disabled={busy || openMoney > 0}>
                Archive space
              </Button>
            )}
            {(life.status === "ACTIVE" || life.status === "INACTIVE") && openMoney > 0 && (
              <p className="w-full text-sm text-muted-foreground">
                Settle {openMoney} open {openMoney === 1 ? "payout or refund" : "payouts and refunds"} before archiving.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
