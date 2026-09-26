"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Trophy, Sparkle } from "@phosphor-icons/react";
import {
  getLeaderboardManage,
  createLeaderboard,
  type LeaderboardManage,
  type LeaderboardMode,
  type LeaderboardEntrantKind,
} from "@/lib/api/leaderboard-api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SetupTab } from "./SetupTab";
import { RoundsTab } from "./RoundsTab";
import { CriteriaTab } from "./CriteriaTab";
import { EntrantsTab } from "./EntrantsTab";
import { PanelsTab } from "./PanelsTab";
import { JudgingTab } from "./JudgingTab";
import { AwardsTab } from "./AwardsTab";

export default function LeaderboardPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [board, setBoard] = useState<LeaderboardManage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("setup");

  const load = useCallback(async () => {
    setError("");
    const { data, error } = await getLeaderboardManage(eventId);
    // `null` (no error) just means "not set up yet" → the create CTA. A real
    // error (e.g. 403 for a non-manager, or the plan gate) is surfaced.
    if (error) setError(error.message);
    else setBoard(data);
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Leaderboard" subtitle="Run a scored competition or hackathon for this event" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!board) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Leaderboard"
          subtitle="Run a scored competition or hackathon for this event"
        />
        {error && <ErrorNotice message={error} />}
        <CreateBoardCta eventId={eventId} onCreated={load} />
      </div>
    );
  }

  const isRubric = board.mode === "RUBRIC";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Trophy className="h-4 w-4" weight="fill" />
            Competition
          </span>
        }
        title={board.title || "Leaderboard"}
        subtitle={
          board.mode === "RUBRIC"
            ? "Judge-scored rubric board — rounds, panels, reviews and named awards."
            : "Live-metric board — organiser-entered values ranked per round."
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={board.status} />
            {!board.enabled && <Badge variant="neutral">Disabled</Badge>}
          </div>
        }
      />

      {error && <ErrorNotice message={error} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="rounds">Rounds</TabsTrigger>
          <TabsTrigger value="criteria">
            {isRubric ? "Criteria" : "Metrics"}
          </TabsTrigger>
          <TabsTrigger value="entrants">Entrants</TabsTrigger>
          {isRubric && <TabsTrigger value="panels">Panels</TabsTrigger>}
          {isRubric && <TabsTrigger value="judging">Judging</TabsTrigger>}
          <TabsTrigger value="awards">Awards</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-6">
          <SetupTab eventId={eventId} board={board} reload={load} />
        </TabsContent>
        <TabsContent value="rounds" className="mt-6">
          <RoundsTab eventId={eventId} board={board} reload={load} />
        </TabsContent>
        <TabsContent value="criteria" className="mt-6">
          <CriteriaTab eventId={eventId} board={board} reload={load} />
        </TabsContent>
        <TabsContent value="entrants" className="mt-6">
          <EntrantsTab eventId={eventId} board={board} reload={load} />
        </TabsContent>
        {isRubric && (
          <TabsContent value="panels" className="mt-6">
            <PanelsTab eventId={eventId} board={board} reload={load} />
          </TabsContent>
        )}
        {isRubric && (
          <TabsContent value="judging" className="mt-6">
            <JudgingTab board={board} />
          </TabsContent>
        )}
        <TabsContent value="awards" className="mt-6">
          <AwardsTab eventId={eventId} board={board} reload={load} />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        The leaderboard is part of PRO and Enterprise plans. Judges and mentors score
        from the mobile app; participants see their round status and winners there too.
      </p>
    </div>
  );
}

/** First-run: pick a mode + entrant kind, name it, create the board. */
function CreateBoardCta({
  eventId,
  onCreated,
}: {
  eventId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LeaderboardMode>("RUBRIC");
  const [entrantKind, setEntrantKind] = useState<LeaderboardEntrantKind>("TEAM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const create = async () => {
    setSaving(true);
    setFormError("");
    const { error } = await createLeaderboard(eventId, {
      mode,
      entrantKind,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message ?? "Could not create the leaderboard.");
      return;
    }
    setOpen(false);
    onCreated();
  };

  return (
    <>
      <EmptyState
        icon={Trophy}
        title="No leaderboard yet"
        description="Set up a scored competition or hackathon — pick judge-scored rubrics or live metrics, add rounds, teams, judges and named awards, all from here."
        tone="positive"
        action={
          <Button onClick={() => setOpen(true)}>
            <Sparkle className="mr-1.5 h-4 w-4" />
            Set up leaderboard
          </Button>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up leaderboard</DialogTitle>
            <DialogDescription>
              You can rename and reconfigure everything later. The board mode is fixed
              once created, so pick the one that matches how you&apos;ll rank entrants.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Board mode</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ModeCard
                  active={mode === "RUBRIC"}
                  onClick={() => setMode("RUBRIC")}
                  title="Rubric"
                  blurb="Judges & mentors score weighted criteria and write reviews. Best for hackathons and pitch competitions."
                />
                <ModeCard
                  active={mode === "METRIC"}
                  onClick={() => setMode("METRIC")}
                  title="Metric"
                  blurb="You enter authoritative values per criterion; entrants rank by a primary metric. Best for measured contests."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Entrants are…</Label>
              <div className="grid grid-cols-2 gap-2">
                <ModeCard
                  active={entrantKind === "TEAM"}
                  onClick={() => setEntrantKind("TEAM")}
                  title="Teams"
                  blurb="Groups compete together."
                />
                <ModeCard
                  active={entrantKind === "INDIVIDUAL"}
                  onClick={() => setEntrantKind("INDIVIDUAL")}
                  title="Individuals"
                  blurb="Solo entrants."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lb-title">Title</Label>
              <Input
                id="lb-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Grand Finals 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lb-desc">Description</Label>
              <Textarea
                id="lb-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — shown to viewers of the public board."
                rows={2}
              />
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? "Creating…" : "Create board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary-soft"
          : "border-border hover:border-primary/40",
      ].join(" ")}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
    </button>
  );
}
