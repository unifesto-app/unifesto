"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  Buildings,
  Users,
  Stack,
  Plus,
} from "@unifesto/unicon/react";
import { createSpace, getAllSpacesAdmin, SPACE_STATUS_LABEL, type AdminSpace, type SpaceActivity } from "@/lib/api/spaces-api";
import type { SpaceKind, SpaceStatus } from "@/lib/types/rbac";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

const PAGE_SIZE = 12;

const STATUS_VARIANT: Record<
  SpaceStatus,
  "neutral" | "brand" | "success" | "warning" | "destructive"
> = {
  PENDING: "warning",
  APPROVED: "success",
  ACTIVE: "success",
  REJECTED: "destructive",
  SUSPENDED: "destructive",
  INACTIVE: "neutral",
  ARCHIVED: "neutral",
};

// Q38: activity is a label, not a status: plain text, coloured only when it needs a look.
const ACTIVITY: Record<SpaceActivity, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "text-muted-foreground" },
  QUIET: { label: "Quiet", className: "text-amber-600 dark:text-amber-400" },
  DORMANT: { label: "Dormant", className: "text-muted-foreground/70" },
};
const ACTIVITY_FILTERS: Array<{ value: SpaceActivity | null; label: string }> = [
  { value: null, label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "QUIET", label: "Quiet" },
  { value: "DORMANT", label: "Dormant" },
];

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<AdminSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [activity, setActivity] = useState<SpaceActivity | null>(null);
  const [creating, setCreating] = useState(false);

  // Debounce search input to avoid a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getAllSpacesAdmin({
      page,
      limit: PAGE_SIZE,
      search: debounced || undefined,
      activity: activity ?? undefined,
    });
    if (error) setError(error.message);
    else if (data) {
      setSpaces(data.spaces);
      setTotalPages(data.pagination.totalPages || 1);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  }, [page, debounced, activity]);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const subtitle = loading
    ? "Loading spaces…"
    : `${total.toLocaleString("en-IN")} space${total === 1 ? "" : "s"} across the platform`;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Spaces"
        subtitle={subtitle}
        actions={
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New space
          </Button>
        }
      />
      {creating && <NewSpaceDialog onClose={() => setCreating(false)} />}

      <div className="relative max-w-sm">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, slug, or type"
          className="pl-9"
          aria-label="Search spaces"
        />
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by activity">
        {ACTIVITY_FILTERS.map((f) => (
          <Button
            key={f.label}
            size="sm"
            variant={activity === f.value ? "default" : "outline"}
            aria-pressed={activity === f.value}
            onClick={() => {
              setActivity(f.value);
              setPage(1);
            }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <TableSkeleton avatar />
          ) : spaces.length === 0 ? (
            <EmptyState
              icon={Buildings}
              tone={debounced ? "neutral" : "positive"}
              title={debounced ? "No spaces match your search" : "No spaces yet"}
              description={
                debounced
                  ? "Try a different name, slug, or type."
                  : "Spaces created on the platform will appear here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Space</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Parent Space</th>
                    <th className="pb-2 pr-4 font-medium">Members</th>
                    <th className="pb-2 pr-4 font-medium">Sub-spaces</th>
                    <th className="pb-2 pr-4 font-medium">Activity</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {spaces.map((s) => (
                    <SpaceRow key={s.id} space={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && spaces.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

/** Admin creates a space (POST /spaces), then lands on it to set branding and hierarchy. */
function NewSpaceDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    websiteUrl: "",
    city: "",
    state: "",
    country: "India",
    type: "REGULAR" as SpaceKind,
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function handleCreate() {
    const name = form.name.trim();
    const slug = form.slug.trim();
    if (name.length < 3) return setError("Name must be at least 3 characters.");
    if (slug.length < 3 || !/^[a-z0-9-]+$/.test(slug))
      return setError("Slug must be 3 or more lowercase letters, numbers, or hyphens.");
    setBusy(true);
    setError("");
    // Blank optional fields are left out, not sent as "".
    const optional = Object.fromEntries(
      (["description", "websiteUrl", "city", "state", "country"] as const)
        .map((k) => [k, form[k].trim()])
        .filter(([, v]) => v)
    );
    const { data, error: apiError } = await createSpace({ name, slug, type: form.type, ...optional });
    if (apiError || !data) {
      setError(apiError?.message ?? "Could not create the space.");
      setBusy(false);
      return;
    }
    router.push(`/dashboard/spaces/${data.id}`);
  }

  const text = (key: "websiteUrl" | "city" | "state" | "country", label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`new-space-${key}`}>{label}</Label>
      <Input
        id={`new-space-${key}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={busy}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New space</DialogTitle>
          <DialogDescription>
            It goes live straight away, Unverified. Add the logo, banner and parent space on the next page.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {error && <ErrorNotice message={error} />}
          <div className="space-y-1.5">
            <Label htmlFor="new-space-name">Name</Label>
            <Input
              id="new-space-name"
              value={form.name}
              onChange={(e) => {
                set("name", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              disabled={busy}
              maxLength={255}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-space-slug">Slug</Label>
            <Input
              id="new-space-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value.toLowerCase());
              }}
              disabled={busy}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-space-type">Type</Label>
            <Select value={form.type} onValueChange={(v) => set("type", v as SpaceKind)} disabled={busy}>
              <SelectTrigger id="new-space-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="REGULAR">Regular: a club, team or community</SelectItem>
                <SelectItem value="SUPER">Super: a college or group that holds sub-spaces</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-space-description">Description</Label>
            <Textarea
              id="new-space-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={busy}
              maxLength={5000}
              rows={3}
            />
          </div>
          {text("websiteUrl", "Website", "https://example.com")}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {text("city", "City")}
            {text("state", "State")}
            {text("country", "Country")}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={handleCreate}>
            {busy ? "Creating…" : "Create space"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpaceRow({ space }: { space: AdminSpace }) {
  const kind = space.type;
  const memberCount = space.member_count;
  const childCount = space.type === "SUPER" ? space.child_count : 0;

  return (
    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50">
      <td className="py-3 pr-4">
        <Link
          href={`/dashboard/spaces/${space.id}`}
          className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-secondary text-secondary-foreground">
            {space.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={space.logo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Buildings className="h-4 w-4" weight="duotone" />
            )}
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium text-foreground">
              <span className="truncate">{space.name}</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">
              /{space.slug}
            </p>
          </div>
        </Link>
      </td>
      <td className="py-3 pr-4">
        {kind ? (
          <Badge variant={kind === "SUPER" ? "brand" : "neutral"}>
            {kind === "SUPER" ? "Super" : "Regular"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 pr-4">
        {space.parentSpace ? (
          <span className="line-clamp-1 text-foreground">
            {space.parentSpace.name}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-3 pr-4 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {memberCount.toLocaleString("en-IN")}
        </span>
      </td>
      <td className="py-3 pr-4 text-muted-foreground">
        {childCount > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <Stack className="h-4 w-4" />
            {childCount.toLocaleString("en-IN")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={`py-3 pr-4 ${ACTIVITY[space.activity_level]?.className ?? "text-muted-foreground"}`}>
        {ACTIVITY[space.activity_level]?.label ?? "—"}
      </td>
      <td className="py-3">
        <Badge variant={STATUS_VARIANT[space.status]}>
          {SPACE_STATUS_LABEL[space.status] ?? space.status}
        </Badge>
      </td>
    </tr>
  );
}
