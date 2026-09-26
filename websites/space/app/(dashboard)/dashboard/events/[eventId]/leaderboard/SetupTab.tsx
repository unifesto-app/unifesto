"use client";

import { useState } from "react";
import { FloppyDisk, Eye, ChatCircleText } from "@phosphor-icons/react";
import {
  updateLeaderboard,
  type LeaderboardManage,
  type LeaderboardStatus,
  type LeaderboardVisibility,
  type LeaderboardTieBreak,
} from "@/lib/api/leaderboard-api";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  eventId: string;
  board: LeaderboardManage;
  reload: () => void;
}

/** A labelled on/off row — the app has no Switch primitive, so this is a button. */
function Toggle({
  checked,
  onChange,
  title,
  description,
  icon: Icon,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" weight="duotone" />
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={[
          "relative mt-0.5 inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

export function SetupTab({ eventId, board, reload }: Props) {
  const [title, setTitle] = useState(board.title ?? "");
  const [description, setDescription] = useState(board.description ?? "");
  const [status, setStatus] = useState<LeaderboardStatus>(board.status);
  const [visibility, setVisibility] = useState<LeaderboardVisibility>(
    board.visibility
  );
  const [tieBreak, setTieBreak] = useState<LeaderboardTieBreak>(board.tieBreak);
  const [tieBreakMetricId, setTieBreakMetricId] = useState<string>(
    board.tieBreakMetricId ?? ""
  );
  const [enabled, setEnabled] = useState(board.enabled);
  const [revealReviews, setRevealReviews] = useState(board.revealReviews);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    const { error } = await updateLeaderboard(eventId, {
      title: title.trim(),
      description: description.trim(),
      status,
      visibility,
      enabled,
      revealReviews,
      tieBreak,
      // Only meaningful when tie-breaking by a metric; blank clears it.
      tieBreakMetricId:
        tieBreak === "PRIMARY_METRIC" && tieBreakMetricId
          ? tieBreakMetricId
          : undefined,
    });
    setSaving(false);
    if (error) {
      setError(error.message ?? "Could not save changes.");
      return;
    }
    setSaved(true);
    reload();
  };

  return (
    <div className="max-w-2xl space-y-4">
      {error && <ErrorNotice message={error} />}

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="s-title">Title</Label>
            <Input
              id="s-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Grand Finals 2026"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Shown to viewers of the public board."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as LeaderboardStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft — hidden from viewers</SelectItem>
                  <SelectItem value="LIVE">Live — visible + updating</SelectItem>
                  <SelectItem value="FROZEN">Frozen — visible, paused</SelectItem>
                  <SelectItem value="FINAL">Final — results locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visibility</Label>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as LeaderboardVisibility)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARTICIPANTS_ONLY">
                    Participants only
                  </SelectItem>
                  <SelectItem value="PUBLIC">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tie-break</Label>
              <Select
                value={tieBreak}
                onValueChange={(v) => setTieBreak(v as LeaderboardTieBreak)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EARLIEST_SUBMISSION">
                    Earliest submission wins
                  </SelectItem>
                  <SelectItem value="PRIMARY_METRIC">
                    Highest primary metric
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tieBreak === "PRIMARY_METRIC" && (
              <div className="space-y-1.5">
                <Label>Tie-break metric</Label>
                <Select
                  value={tieBreakMetricId || "none"}
                  onValueChange={(v) =>
                    setTieBreakMetricId(v === "none" ? "" : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a metric" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {board.metrics.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Toggle
          checked={enabled}
          onChange={setEnabled}
          icon={Eye}
          title="Board enabled"
          description="Master switch. When off, the board is hidden everywhere regardless of status."
        />
        <Toggle
          checked={revealReviews}
          onChange={setRevealReviews}
          icon={ChatCircleText}
          title="Reveal written feedback to participants"
          description="Opens each team's own reviews to them. Marks are never shown to participants."
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          <FloppyDisk className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && <span className="text-sm text-success">Saved.</span>}
      </div>
    </div>
  );
}
