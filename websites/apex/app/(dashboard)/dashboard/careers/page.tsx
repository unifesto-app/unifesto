"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  Plus,
  PencilSimple,
  Trash,
  MapPin,
  Users,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCareer,
  deleteCareer,
  getAllCareers,
  updateCareer,
  type Career,
  type CareerInput,
  type CareerStatus,
} from "@/lib/api/careers-api";
import { useUnsavedGuard } from "@/lib/utils/use-unsaved-guard";

const STATUS_BADGE: Record<
  CareerStatus,
  { label: string; variant: "success" | "neutral" | "warning" }
> = {
  OPEN: { label: "Open", variant: "success" },
  CLOSED: { label: "Closed", variant: "neutral" },
  DRAFT: { label: "Draft", variant: "warning" },
};

export default function CareersPage() {
  const [careers, setCareers] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Career | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await getAllCareers();
    setLoading(false);
    if (err) setError(err.message);
    else {
      setError("");
      setCareers(data ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (c: Career) => {
    // K3: a role with applicants is closed, never deleted (that would drop
    // the applications and their résumés).
    const applicants = c._count?.applications ?? 0;
    if (applicants > 0) {
      if (c.status === "CLOSED") {
        return setError(`"${c.title}" has ${applicants} application${applicants === 1 ? "" : "s"}, so it stays closed instead of being deleted.`);
      }
      if (!window.confirm(`"${c.title}" has ${applicants} application${applicants === 1 ? "" : "s"}, so it can't be deleted. Close it instead? It leaves the careers page and the applications are kept.`)) return;
      const { error: err } = await updateCareer(c.id, { status: "CLOSED" });
      if (err) return setError(err.message);
      return setCareers((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: "CLOSED" } : x)));
    }
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    const { error: err } = await deleteCareer(c.id);
    if (err) return setError(err.message);
    setCareers((cs) => cs.filter((x) => x.id !== c.id));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Careers"
        subtitle="Manage the job openings shown on the public careers page."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New role
          </Button>
        }
      />

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : careers.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Briefcase}
              title="No roles yet"
              description="Create a job opening to publish it on the public careers page."
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> New role
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {careers.map((c) => {
            const badge = STATUS_BADGE[c.status];
            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">
                      {c.title}
                    </p>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{c.department}</span>
                    <span>·</span>
                    <span>{c.type}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {c.location}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/careers/${c.id}/applications`}>
                      <Users className="h-4 w-4" /> Applications
                      {c._count ? ` (${c._count.applications})` : ""}
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(c)}
                  >
                    <PencilSimple className="h-4 w-4" /> Edit
                  </Button>
                  <Button aria-label={c._count?.applications ? "Close role" : "Delete"}
                    title={c._count?.applications ? "Has applications: close instead of delete" : undefined}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(c)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <CareerDialog
          career={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

const linesToArray = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const arrayToLines = (a: string[]) => a.join("\n");

function CareerDialog({
  career,
  onClose,
  onSaved,
}: {
  career: Career | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [initial] = useState(() => ({
    title: career?.title ?? "",
    department: career?.department ?? "",
    location: career?.location ?? "",
    type: career?.type ?? "Full-time",
    experienceLevel: career?.experienceLevel ?? "",
    description: career?.description ?? "",
    requirements: arrayToLines(career?.requirements ?? []),
    responsibilities: arrayToLines(career?.responsibilities ?? []),
    benefits: arrayToLines(career?.benefits ?? []),
    salaryRange: career?.salaryRange ?? "",
    status: (career?.status ?? "DRAFT") as CareerStatus,
  }));
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const guardedClose = useUnsavedGuard(!saving && JSON.stringify(form) !== JSON.stringify(initial));
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim() || !form.department.trim() || !form.location.trim()) {
      return setErr("Title, department and location are required.");
    }
    setErr("");
    setSaving(true);
    const payload: CareerInput = {
      title: form.title.trim(),
      department: form.department.trim(),
      location: form.location.trim(),
      type: form.type.trim(),
      experienceLevel: form.experienceLevel.trim(),
      description: form.description.trim(),
      requirements: linesToArray(form.requirements),
      responsibilities: linesToArray(form.responsibilities),
      benefits: linesToArray(form.benefits),
      salaryRange: form.salaryRange.trim() || undefined,
      status: form.status,
    };
    const { error } = career
      ? await updateCareer(career.id, payload)
      : await createCareer(payload);
    setSaving(false);
    if (error) setErr(error.message);
    else onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && guardedClose(onClose)}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{career ? "Edit role" : "New role"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="careers-title">Title</Label>
            <Input id="careers-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="careers-department">Department</Label>
              <Input id="careers-department"
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                placeholder="Engineering"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="careers-location">Location</Label>
              <Input id="careers-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Remote · India"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="careers-employment-type">Employment type</Label>
              <Input id="careers-employment-type"
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                placeholder="Full-time"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="careers-experience-level">Experience level</Label>
              <Input id="careers-experience-level"
                value={form.experienceLevel}
                onChange={(e) => set("experienceLevel", e.target.value)}
                placeholder="Mid–Senior"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="careers-description">Description</Label>
            <Textarea id="careers-description"
              rows={4}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What the role is about."
            />
          </div>

          {(
            [
              ["requirements", "Requirements"],
              ["responsibilities", "Responsibilities"],
              ["benefits", "Benefits"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`career-${key}`}>{label}</Label>
              <Textarea
                id={`career-${key}`}
                rows={4}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder="One per line"
              />
              <p className="text-xs text-muted-foreground">One item per line.</p>
            </div>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="careers-salary-range-optional">Salary range (optional)</Label>
              <Input id="careers-salary-range-optional"
                value={form.salaryRange}
                onChange={(e) => set("salaryRange", e.target.value)}
                placeholder="₹12–18 LPA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="careers-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as CareerStatus)}
              >
                <SelectTrigger id="careers-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft (hidden)</SelectItem>
                  <SelectItem value="OPEN">Open (public)</SelectItem>
                  <SelectItem value="CLOSED">Closed (hidden)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => guardedClose(onClose)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : career ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
