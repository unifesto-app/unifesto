"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MagnifyingGlass,
  Buildings,
  Users,
  Stack,
  SealCheck,
} from "@phosphor-icons/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getMySpaces,
  getAllSpacesAdmin,
  type AdminSpace,
} from "@/lib/api/spaces-api";
import {
  isSpaceOperatorRole,
  type SpaceWithHierarchy,
  type SpaceStatus,
} from "@/lib/types/rbac";
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

function roleLabel(code?: string) {
  if (!code) return null;
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type DisplaySpace = SpaceWithHierarchy | AdminSpace;

function isAdminSpace(space: DisplaySpace): space is AdminSpace {
  return "roleCounts" in space;
}

export default function SpacesPage() {
  const { role, loading: sessionLoading } = useSession();
  const isAdmin = role === "platform_admin";

  const [spaces, setSpaces] = useState<DisplaySpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

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
    });
    if (error) setError(error.message);
    else if (data) {
      setSpaces(data.spaces);
      setTotalPages(data.pagination.totalPages || 1);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  }, [page, debounced]);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getMySpaces();
    if (error) setError(error.message);
    else
      // Organisers only manage spaces where they hold an organiser role —
      // exclude spaces where they're merely a member/volunteer.
      setSpaces(
        (data ?? []).filter((s) => isSpaceOperatorRole(s.userRole?.code))
      );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (isAdmin) void loadAdmin();
    else void loadMine();
  }, [sessionLoading, isAdmin, loadAdmin, loadMine]);

  // Non-admins fetch all their spaces once, so filter + paginate client-side.
  const clientFiltered = useMemo(() => {
    if (isAdmin) return spaces;
    const q = debounced.toLowerCase();
    if (!q) return spaces;
    return spaces.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (!isAdminSpace(s) &&
          (s.spaceKind === "SUPER" ? "super" : "regular").includes(q))
    );
  }, [spaces, debounced, isAdmin]);

  // Admin pages come pre-sliced from the server; non-admins slice locally.
  const visible = useMemo(() => {
    if (isAdmin) return spaces;
    const start = (page - 1) * PAGE_SIZE;
    return clientFiltered.slice(start, start + PAGE_SIZE);
  }, [isAdmin, spaces, clientFiltered, page]);

  const effectiveTotalPages = isAdmin
    ? totalPages
    : Math.max(1, Math.ceil(clientFiltered.length / PAGE_SIZE));
  const effectiveTotal = isAdmin ? total : clientFiltered.length;

  const subtitle = loading
    ? "Loading spaces…"
    : isAdmin
      ? `${effectiveTotal.toLocaleString("en-IN")} space${effectiveTotal === 1 ? "" : "s"} across the platform`
      : "The spaces you organise, with your role in each";

  return (
    <div className="space-y-6">
      <PageHeader title="Spaces" subtitle={subtitle} />

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

      {error && <ErrorNotice message={error} />}

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <TableSkeleton avatar />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Buildings}
              tone={debounced ? "neutral" : "positive"}
              title={debounced ? "No spaces match your search" : "No spaces yet"}
              description={
                debounced
                  ? "Try a different name, slug, or type."
                  : isAdmin
                    ? "Spaces created on the platform will appear here."
                    : "Once you're granted an organiser role in a space, it will show up here."
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Space</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Parent Space</th>
                    <th className="pb-2 pr-4 font-medium">Members</th>
                    <th className="pb-2 pr-4 font-medium">Sub-spaces</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <SpaceRow key={s.id} space={s} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && visible.length > 0 && effectiveTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {effectiveTotalPages}
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
              disabled={page >= effectiveTotalPages}
              onClick={() => setPage((p) => Math.min(effectiveTotalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SpaceRow({ space }: { space: DisplaySpace }) {
  const admin = isAdminSpace(space);
  const verified = !admin && space.is_verified;
  const kind = admin ? space.type : space.spaceKind;
  const memberCount = space.member_count;
  const childCount = admin
    ? space.type === "SUPER"
      ? space.child_count
      : 0
    : space.sub_org_count;

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
              {verified && (
                <SealCheck
                  className="h-4 w-4 flex-shrink-0 text-primary"
                  weight="fill"
                  aria-label="Verified"
                />
              )}
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
      <td className="py-3">
        {admin ? (
          <Badge variant={STATUS_VARIANT[space.status]}>
            {roleLabel(space.status) ?? space.status}
          </Badge>
        ) : space.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="warning">Inactive</Badge>
        )}
      </td>
    </tr>
  );
}
