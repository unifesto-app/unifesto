"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Buildings,
  Users,
  Stack,
  SealCheck,
  Lock,
  MapPin,
  CalendarBlank,
  CheckCircle,
  XCircle,
  TreeStructure,
  ArrowUp,
  ArrowDown,
  LinkBreak,
  Eye,
  CaretRight,
  CaretLeft,
  MagnifyingGlass,
  Plus,
  Trash,
  UserPlus,
  PencilSimple,
  FloppyDisk,
  X,
} from "@unifesto/unicon/react";
import { useSession } from "@/lib/context/SessionContext";
import {
  getSpace,
  getMySpaces,
  getSpaceChildren,
  approveSpace,
  rejectSpace,
  updateSpaceStatus,
  updateSpace,
  getAllSpacesAdmin,
  getSpaceMembers,
  searchAddableUsers,
  addSpaceMember,
  updateSpaceMemberRole,
  removeSpaceMember,
  deleteSpace,
  uploadSpaceLogo,
  uploadSpaceBanner,
  type ChildSpace,
  type SpaceMember,
  type SpaceMemberRoleCode,
  type AddableUser,
  type SpaceVisibility,
  type UpdateSpacePayload,
} from "@/lib/api/spaces-api";
import {
  createSubSpaceRequest,
  type SubSpaceRequestType,
} from "@/lib/api/requests-api";
import { isSpaceOperatorRole } from "@/lib/types/rbac";
import type {
  SpaceWithHierarchy,
  SpaceStatus,
  SpaceKind,
} from "@/lib/types/rbac";
import { PageHeader } from "@/components/shared/PageHeader";
import { ImageUploadCard } from "@/components/shared/ImageUploadCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { StatCard } from "@/components/shared/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function roleLabel(code?: string | null) {
  if (!code) return null;
  return code
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Space management detail — scoped to Space Admins. */
export default function SpaceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { role, loading: sessionLoading } = useSession();
  const isAdmin = role === "platform_admin";

  const [space, setSpace] = useState<SpaceWithHierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Spaces the current user directly organises — used to detect whether they
  // are a Space Admin of THIS space's parent (grants read-only access).
  const [mySpaces, setMySpaces] = useState<SpaceWithHierarchy[]>([]);

  const reload = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getSpace(id);
    if (error) setError(error.message);
    else setSpace(data);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const [spaceRes, mineRes] = await Promise.all([
        getSpace(id),
        getMySpaces(),
      ]);
      if (cancelled) return;
      if (spaceRes.error) setError(spaceRes.error.message);
      else setSpace(spaceRes.data);
      setMySpaces(mineRes.data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Only Space Admins (or platform admins) may manage a space.
  const canManage = useMemo(() => {
    if (isAdmin) return true;
    return isSpaceOperatorRole(space?.userRole?.code);
  }, [isAdmin, space]);

  // A user who organises this space's parent (SUPER) space may VIEW it read-only,
  // even without a direct role here. They can see the child's data but not edit.
  const isParentOrganiser = useMemo(() => {
    if (canManage) return false;
    const parentId = space?.parentSpaceId;
    if (!parentId) return false;
    return mySpaces.some(
      (s) => s.id === parentId && isSpaceOperatorRole(s.userRole?.code)
    );
  }, [canManage, space, mySpaces]);

  const busy = loading || sessionLoading;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/spaces"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to spaces
      </Link>

      {busy ? (
        <div className="space-y-6">
          <Skeleton className="h-16 w-72 rounded-lg" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-56 rounded-lg" />
        </div>
      ) : error ? (
        <ErrorNotice message={error} />
      ) : !space ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Buildings}
              title="Space not found"
              description="This space may have been removed, or the link is out of date."
            />
          </CardContent>
        </Card>
      ) : !canManage && !isParentOrganiser ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Lock}
              title="You can't manage this space"
              description="Space management is available to Space Admins only. Ask a Space Admin to grant you a role."
            />
          </CardContent>
        </Card>
      ) : (
        <SpaceManagement
          space={space}
          isAdmin={isAdmin}
          readOnly={!canManage}
          onChange={reload}
        />
      )}
    </div>
  );
}

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

/** Lifecycle states an admin can move a space into post-approval. */
const MANAGEABLE_STATUSES: SpaceStatus[] = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "ARCHIVED",
];

function SpaceManagement({
  space,
  isAdmin,
  readOnly = false,
  onChange,
}: {
  space: SpaceWithHierarchy;
  isAdmin: boolean;
  /** True when the viewer may only VIEW this space (e.g. a parent organiser). */
  readOnly?: boolean;
  onChange: () => Promise<void>;
}) {
  const isSuper = space.spaceKind === "SUPER";
  const [tab, setTab] = useState<"overview" | "members">("overview");
  const [editing, setEditing] = useState(false);
  // Parent organisers (readOnly) have no direct role here, so the members
  // endpoint (SpaceRoleGuard) would 403 for them — hide the Members tab.
  const canViewMembers = !readOnly && (isAdmin || isSpaceOperatorRole(space.userRole?.code));
  const canEdit =
    !readOnly && (isAdmin || isSpaceOperatorRole(space.userRole?.code));
  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            You&apos;re viewing this space because you organise its parent
            space. This view is read-only — you can&apos;t make changes here.
          </span>
        </div>
      )}
      <PageHeader
        title={space.name}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            /{space.slug}
            {space.is_verified && (
              <SealCheck
                className="h-4 w-4 text-primary"
                weight="fill"
                aria-label="Verified"
              />
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {isAdmin && space.spaceKind && (
              <Badge variant={space.spaceKind === "SUPER" ? "brand" : "neutral"}>
                {space.spaceKind === "SUPER" ? "Super" : "Regular"}
              </Badge>
            )}
            {isAdmin && space.status && (
              <Badge variant={STATUS_VARIANT[space.status]}>
                {roleLabel(space.status) ?? space.status}
              </Badge>
            )}
            {roleLabel(space.userRole?.code) && (
              <Badge variant="brand">{roleLabel(space.userRole?.code)}</Badge>
            )}
            {isAdmin && !space.userRole?.code && (
              <Badge variant="outline">Admin view</Badge>
            )}
            {readOnly && (
              <Badge variant="outline" className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                View only
              </Badge>
            )}
            {!isAdmin && !space.is_active && (
              <Badge variant="warning">Inactive</Badge>
            )}
            {canEdit && !editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
                className="gap-1.5"
              >
                <PencilSimple className="h-4 w-4" />
                Edit space
              </Button>
            )}
          </div>
        }
      />

      {canEdit && editing && (
        <EditSpacePanel
          space={space}
          onChange={onChange}
          onClose={() => setEditing(false)}
        />
      )}

      {canViewMembers && (
        <div className="flex items-center gap-1 border-b border-border">
          <TabButton
            active={tab === "overview"}
            onClick={() => setTab("overview")}
          >
            Overview
          </TabButton>
          <TabButton
            active={tab === "members"}
            onClick={() => setTab("members")}
          >
            Members
          </TabButton>
        </div>
      )}

      {canViewMembers && tab === "members" ? (
        <MembersPanel space={space} isAdmin={isAdmin} onChange={onChange} />
      ) : (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title="Members"
              value={(space.member_count ?? 0).toLocaleString("en-IN")}
              hint="People in this space"
              icon={Users}
              tone="brand"
            />
            <StatCard
              title="Sub-spaces"
              value={(space.sub_org_count ?? 0).toLocaleString("en-IN")}
              hint="Part of this space"
              icon={Stack}
            />
            <StatCard
              title="Depth"
              value={`L${space.depth_level ?? 0}`}
              hint="Position in the hierarchy"
              icon={Buildings}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
              <CardDescription>
                How this space presents itself to members.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {space.description ? (
                <p className="text-sm leading-relaxed text-foreground">
                  {space.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No description added yet.
                </p>
              )}
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <DetailRow
                  icon={CalendarBlank}
                  label="Created"
                  value={formatDate(space.created_at)}
                />
                <DetailRow
                  icon={CalendarBlank}
                  label="Last updated"
                  value={formatDate(space.updated_at)}
                />
                <DetailRow
                  icon={MapPin}
                  label="Visibility"
                  value={space.is_active ? "Active" : "Inactive"}
                />
                <DetailRow
                  icon={SealCheck}
                  label="Verification"
                  value={space.is_verified ? "Verified" : "Not verified"}
                />
              </dl>
            </CardContent>
          </Card>

          {isAdmin && !readOnly && <SpaceBrandingCard space={space} />}
        </div>

        <div className="space-y-4">
          {isAdmin && !readOnly && (
            <AdminSpacePanel
              spaceId={space.id}
              status={space.status}
              onChange={onChange}
            />
          )}

          {isSuper && <ChildSpacesPanel space={space} readOnly={readOnly} />}

          {!readOnly && (
            <OrganiserHierarchyPanel
              space={space}
              isAdmin={isAdmin}
              onChange={onChange}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle>Manage</CardTitle>
              <CardDescription>
                {readOnly ? "View this space's activity." : "Common space actions."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link href={`/dashboard/events?spaceId=${space.id}`}>
                  <CalendarBlank className="h-4 w-4" />
                  View events
                </Link>
              </Button>
              {canViewMembers ? (
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setTab("members")}
                >
                  <Users className="h-4 w-4" />
                  Members
                </Button>
              ) : (
                <Button variant="outline" className="justify-start" asChild>
                  <Link href={`/dashboard/users?spaceId=${space.id}`}>
                    <Users className="h-4 w-4" />
                    Members
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {isAdmin && !readOnly && (
            <DeleteSpaceCard spaceId={space.id} spaceSlug={space.slug} />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

/**
 * Admin branding controls: replace a space's logo and banner on the space's
 * behalf. Backed by `POST /spaces/:id/logo` and `/banner`, whose SpaceRoleGuard
 * grants platform admins access to any space — the same endpoints organisers use
 * from their own space settings. State is local: uploads return the new URL, so
 * the preview updates without re-fetching the whole space.
 */
function SpaceBrandingCard({ space }: { space: SpaceWithHierarchy }) {
  // `GET /spaces/:id` sends Prisma camelCase (logoUrl/bannerUrl); older builds
  // may send snake_case. Read either so the preview seeds correctly.
  const s = space as unknown as Record<string, unknown>;
  const [logoUrl, setLogoUrl] = useState<string | null>(
    (s.logoUrl ?? s.logo_url ?? null) as string | null
  );
  const [bannerUrl, setBannerUrl] = useState<string | null>(
    (s.bannerUrl ?? s.banner_url ?? null) as string | null
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Branding</CardTitle>
        <CardDescription>
          Update this space&apos;s logo and banner on the organiser&apos;s behalf.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <ImageUploadCard
          title="Logo"
          description="Square image works best."
          imageUrl={logoUrl}
          aspectClassName="aspect-square"
          containerClassName="max-w-[10rem]"
          emptyLabel="No logo yet"
          maxSizeMb={2}
          cropAspect={1}
          onUpload={async (file) => {
            const { data, error } = await uploadSpaceLogo(space.id, file);
            return { url: data?.logoUrl ?? null, error: error?.message ?? null };
          }}
          onUploaded={(url) => setLogoUrl(url)}
        />
        <ImageUploadCard
          title="Banner"
          description="Wide image shown at the top of the space."
          imageUrl={bannerUrl}
          aspectClassName="aspect-[16/9]"
          containerClassName="max-w-md"
          emptyLabel="No banner yet"
          maxSizeMb={5}
          cropAspect={4 / 3}
          onUpload={async (file) => {
            const { data, error } = await uploadSpaceBanner(space.id, file);
            return { url: data?.bannerUrl ?? null, error: error?.message ?? null };
          }}
          onUploaded={(url) => setBannerUrl(url)}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Admin-only danger zone: permanently delete a space. The delete cascades to
 * every event, registration, ticket, payment and payout under the space, so it
 * is gated behind typing the space slug to confirm.
 */
function DeleteSpaceCard({
  spaceId,
  spaceSlug,
}: {
  spaceId: string;
  spaceSlug: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    const { error } = await deleteSpace(spaceId);
    if (error) {
      setError(error.message || "Could not delete the space.");
      setDeleting(false);
      return;
    }
    router.replace("/dashboard/spaces");
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete space</CardTitle>
        <CardDescription>
          Permanently deletes this space and everything under it — all its
          events, registrations, tickets, payments and payouts. This cannot be
          undone. A space with sub-spaces must have them detached first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <ErrorNotice message={error} />}
        <div className="space-y-1.5">
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-medium">{spaceSlug}</span> to
            confirm
          </Label>
          <Input
            id="confirm-delete"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={spaceSlug}
            autoComplete="off"
          />
        </div>
        <Button
          variant="destructive"
          disabled={deleting || confirm !== spaceSlug}
          onClick={handleDelete}
          className="gap-1.5"
        >
          <Trash className="h-4 w-4" />
          {deleting ? "Deleting…" : "Delete this space"}
        </Button>
      </CardContent>
    </Card>
  );
}

/** A single segmented-control tab button used on the space detail page. */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Ordered, human-friendly labels for the space-scoped roles. */
const SPACE_ROLE_ORDER: SpaceMemberRoleCode[] = ["SPACE_ADMIN", "MEMBER"];

const SPACE_ROLE_LABEL: Record<SpaceMemberRoleCode, string> = {
  SPACE_ADMIN: "Space Admin",
  MEMBER: "Member",
};

const SPACE_ROLE_VARIANT: Record<
  SpaceMemberRoleCode,
  "brand" | "neutral" | "outline"
> = {
  SPACE_ADMIN: "brand",
  MEMBER: "neutral",
};

/**
 * Roles the current actor may assign / manage — mirrors the backend
 * `manageableRolesFor`. Admins manage everything; a Space Admin manages
 * admin and member; everyone else manages nothing.
 */
function manageableRoles(
  isAdmin: boolean,
  actorRole?: string | null
): SpaceMemberRoleCode[] {
  if (isAdmin) return ["SPACE_ADMIN", "MEMBER"];
  if (actorRole === "SPACE_ADMIN") return ["SPACE_ADMIN", "MEMBER"];
  return [];
}

const MEMBERS_PAGE_SIZE = 15;

function initials(name?: string | null, fallback?: string | null) {
  const base = (name || fallback || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MembersPanel({
  space,
  isAdmin,
  onChange,
}: {
  space: SpaceWithHierarchy;
  isAdmin: boolean;
  onChange: () => Promise<void>;
}) {
  const spaceId = space.id;
  const assignable = useMemo(
    () => manageableRoles(isAdmin, space.userRole?.code),
    [isAdmin, space.userRole?.code]
  );
  const canManageMembers = assignable.length > 0;

  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Debounced value that actually drives fetching.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getSpaceMembers(spaceId, {
      page,
      limit: MEMBERS_PAGE_SIZE,
      search: debouncedSearch || undefined,
    });
    if (error) {
      setError(error.message);
    } else if (data) {
      setMembers(data.members ?? []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total ?? 0);
    }
    setLoading(false);
  }, [spaceId, page, debouncedSearch]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadMembers(), onChange()]);
  }, [loadMembers, onChange]);

  async function handleUpdateRole(m: SpaceMember, role: SpaceMemberRoleCode) {
    if (role === m.role.code) return;
    setRowBusy(m.id);
    setActionError("");
    const { error } = await updateSpaceMemberRole(spaceId, m.id, role);
    if (error) setActionError(error.message);
    else await reloadAll();
    setRowBusy(null);
  }

  async function handleRemove(m: SpaceMember) {
    const label = m.user.fullName || m.user.username || "this member";
    if (!window.confirm(`Remove ${label} from this space?`)) return;
    setRowBusy(m.id);
    setActionError("");
    const { error } = await removeSpaceMember(spaceId, m.id);
    if (error) setActionError(error.message);
    else await reloadAll();
    setRowBusy(null);
  }

  return (
    <div className="space-y-4">
      {canManageMembers && (
        <AddMemberCard
          spaceId={spaceId}
          assignable={assignable}
          onAdded={reloadAll}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                {total.toLocaleString("en-IN")}{" "}
                {total === 1 ? "person" : "people"} in this space.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search members…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionError && <ErrorNotice message={actionError} />}
          {error ? (
            <ErrorNotice message={error} />
          ) : loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title={debouncedSearch ? "No matches" : "No members yet"}
              description={
                debouncedSearch
                  ? "Try a different name, username, or email."
                  : "Add members to build out this space."
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => {
                const roleCode = m.role.code as SpaceMemberRoleCode;
                // Actor may edit this row only if they manage the member's
                // CURRENT role. The organiser (space owner) row is protected
                // on the backend; still surface it as non-editable here.
                const canEditRow =
                  canManageMembers && assignable.includes(roleCode);
                const busyRow = rowBusy === m.id;
                return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                        {m.user.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.user.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials(m.user.fullName, m.user.username)
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {m.user.fullName || m.user.username || "Unknown user"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.user.username ? `@${m.user.username}` : m.user.email}
                          {" · joined "}
                          {formatDate(m.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:justify-end">
                      {canEditRow ? (
                        <Select
                          value={roleCode}
                          onValueChange={(v) =>
                            handleUpdateRole(m, v as SpaceMemberRoleCode)
                          }
                          disabled={busyRow}
                        >
                          <SelectTrigger className="h-9 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SPACE_ROLE_ORDER.filter((r) =>
                              assignable.includes(r)
                            ).map((r) => (
                              <SelectItem key={r} value={r}>
                                {SPACE_ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant={SPACE_ROLE_VARIANT[roleCode] ?? "neutral"}>
                          {SPACE_ROLE_LABEL[roleCode] ?? m.role.name}
                        </Badge>
                      )}
                      {canEditRow && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove member"
                          disabled={busyRow}
                          onClick={() => handleRemove(m)}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!loading && !error && totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <CaretLeft className="h-4 w-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <CaretRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Search-and-add control for putting a new user into the space. */
function AddMemberCard({
  spaceId,
  assignable,
  onAdded,
}: {
  spaceId: string;
  assignable: SpaceMemberRoleCode[];
  onAdded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddableUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AddableUser | null>(null);
  const [role, setRole] = useState<SpaceMemberRoleCode>(
    assignable.includes("MEMBER") ? "MEMBER" : assignable[0]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selected) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await searchAddableUsers(spaceId, term);
      if (cancelled) return;
      setResults(data?.users ?? []);
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, spaceId, selected]);

  async function handleAdd() {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { error } = await addSpaceMember(spaceId, selected.id, role);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setSelected(null);
    setQuery("");
    setResults([]);
    setBusy(false);
    await onAdded();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" />
          Add member
        </CardTitle>
        <CardDescription>
          Search by name, username, or email, then choose a role.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <ErrorNotice message={error} />}
        {selected ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label>Selected user</Label>
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <span className="truncate">
                  {selected.fullName || selected.username || selected.email}
                  {selected.username && (
                    <span className="text-muted-foreground">
                      {" "}
                      @{selected.username}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(null)}
                >
                  Change
                </button>
              </div>
            </div>
            <div className="space-y-1 sm:w-44">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as SpaceMemberRoleCode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPACE_ROLE_ORDER.filter((r) => assignable.includes(r)).map(
                    (r) => (
                      <SelectItem key={r} value={r}>
                        {SPACE_ROLE_LABEL[r]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={busy}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        ) : (
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search users to add…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {searching ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    Searching…
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No users found.
                  </p>
                ) : (
                  <ul className="max-h-56 overflow-y-auto">
                    {results.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setSelected(u);
                            setResults([]);
                          }}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                            {initials(u.fullName, u.username)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">
                              {u.fullName || u.username || u.email}
                            </span>
                            {u.username && (
                              <span className="block truncate text-xs text-muted-foreground">
                                @{u.username}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SPACE_VISIBILITIES: { value: SpaceVisibility; label: string }[] = [
  { value: "PUBLIC", label: "Public" },
  { value: "PRIVATE", label: "Private" },
  { value: "RESTRICTED", label: "Restricted" },
];

/**
 * Edit the space's profile fields. Available to platform admins and the
 * space's own Space Admins (backend `PATCH /spaces/:id` is guarded
 * by `SpaceRoleGuard`, which permits both). Structural changes (kind / parent)
 * are handled separately via hierarchy requests.
 */
function EditSpacePanel({
  space,
  onChange,
  onClose,
}: {
  space: SpaceWithHierarchy;
  onChange: () => Promise<void>;
  onClose: () => void;
}) {
  const raw = space as unknown as Record<string, unknown>;
  const initial = useMemo(
    () => ({
      name: (space.name as string) ?? "",
      slug: (space.slug as string) ?? "",
      description: (space.description as string | null) ?? "",
      websiteUrl: (raw.websiteUrl as string | null) ?? "",
      city: (raw.city as string | null) ?? "",
      state: (raw.state as string | null) ?? "",
      country: (raw.country as string | null) ?? "",
      tags: Array.isArray(raw.tags) ? (raw.tags as string[]).join(", ") : "",
      visibility: ((raw.visibility as SpaceVisibility) ?? "PUBLIC") as
        | SpaceVisibility
        | "",
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [space.id]
  );

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    const name = form.name.trim();
    if (name.length < 3 || name.length > 255)
      return "Name must be between 3 and 255 characters.";
    const slug = form.slug.trim();
    if (slug.length < 3 || slug.length > 100)
      return "Slug must be between 3 and 100 characters.";
    if (!/^[a-z0-9-]+$/.test(slug))
      return "Slug must contain only lowercase letters, numbers, and hyphens.";
    if (form.description.length > 5000)
      return "Description must be 5000 characters or fewer.";
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload: UpdateSpacePayload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      websiteUrl: form.websiteUrl.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      tags,
    };
    if (form.visibility) payload.visibility = form.visibility;
    const { error: apiError } = await updateSpace(space.id, payload);
    if (apiError) {
      setError(apiError.message);
      setBusy(false);
      return;
    }
    await onChange();
    setBusy(false);
    onClose();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Edit space</CardTitle>
        <CardDescription>
          Update this space&apos;s profile and details.
        </CardDescription>
      </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {error && <ErrorNotice message={error} />}

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-name">Name</Label>
            <Input
              id="edit-space-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              disabled={busy}
              maxLength={255}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-slug">Slug</Label>
            <Input
              id="edit-space-slug"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
              disabled={busy}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-description">Description</Label>
            <textarea
              id="edit-space-description"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              disabled={busy}
              maxLength={5000}
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-website">Website</Label>
            <Input
              id="edit-space-website"
              value={form.websiteUrl}
              onChange={(e) => set("websiteUrl", e.target.value)}
              disabled={busy}
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-space-city">City</Label>
              <Input
                id="edit-space-city"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-space-state">State</Label>
              <Input
                id="edit-space-state"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-space-country">Country</Label>
              <Input
                id="edit-space-country"
                value={form.country}
                onChange={(e) => set("country", e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-tags">Tags</Label>
            <Input
              id="edit-space-tags"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              disabled={busy}
              placeholder="tech, culture, sports"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-space-visibility">Visibility</Label>
            <Select
              value={form.visibility || undefined}
              onValueChange={(v) => set("visibility", v as SpaceVisibility)}
              disabled={busy}
            >
              <SelectTrigger id="edit-space-visibility">
                <SelectValue placeholder="Select visibility" />
              </SelectTrigger>
              <SelectContent>
                {SPACE_VISIBILITIES.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              disabled={busy}
              onClick={handleSave}
              className="gap-1.5"
            >
              <FloppyDisk className="h-4 w-4" />
              {busy ? "Saving…" : "Save changes"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setForm(initial);
                setError("");
                onClose();
              }}
              className="gap-1.5"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </CardContent>
    </Card>
  );
}

function AdminSpacePanel({
  spaceId,
  status,
  onChange,
}: {
  spaceId: string;
  status?: SpaceStatus;
  onChange: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState<SpaceStatus | "">("");

  const isPending = status === "PENDING";

  async function run(fn: () => Promise<{ error: { message: string } | null }>) {
    setBusy(true);
    setActionError("");
    const { error } = await fn();
    if (error) {
      setActionError(error.message);
      setBusy(false);
      return false;
    }
    await onChange();
    setBusy(false);
    return true;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin controls</CardTitle>
        <CardDescription>
          {isPending
            ? "This space is awaiting review. Approve it to make it live, or reject it with a reason."
            : "Manage this space's lifecycle state."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {actionError && <ErrorNotice message={actionError} />}

        {isPending ? (
          rejecting ? (
            <div className="space-y-3">
              <Input
                placeholder="Reason for rejection (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await run(() =>
                      rejectSpace(spaceId, reason.trim() || undefined)
                    );
                    if (ok) {
                      setRejecting(false);
                      setReason("");
                    }
                  }}
                >
                  <XCircle className="h-4 w-4" />
                  Confirm rejection
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busy}
                onClick={() => run(() => approveSpace(spaceId))}
              >
                <CheckCircle className="h-4 w-4" />
                Approve
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                <XCircle className="h-4 w-4" />
                Reject
              </Button>
            </div>
          )
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] space-y-1.5">
              <Label htmlFor="space-status">Lifecycle state</Label>
              <Select
                value={nextStatus || status || ""}
                onValueChange={(v) => setNextStatus(v as SpaceStatus)}
                disabled={busy}
              >
                <SelectTrigger id="space-status">
                  <SelectValue placeholder="Select a state" />
                </SelectTrigger>
                <SelectContent>
                  {MANAGEABLE_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {roleLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !nextStatus || nextStatus === status}
              onClick={async () => {
                if (!nextStatus) return;
                const ok = await run(() =>
                  updateSpaceStatus(spaceId, nextStatus)
                );
                if (ok) setNextStatus("");
              }}
            >
              Update state
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: IconCmp,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <IconCmp className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="text-sm text-foreground">{value}</dd>
      </div>
    </div>
  );
}

/**
 * Lists the child spaces of a Super space. Each child links to its own detail
 * page, where a Space Admin of this parent can view it read-only.
 */
const CHILD_SPACES_PAGE_SIZE = 8;

function ChildSpacesPanel({
  space,
  readOnly,
}: {
  space: SpaceWithHierarchy;
  readOnly: boolean;
}) {
  const [children, setChildren] = useState<ChildSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await getSpaceChildren(space.id, {
        page,
        limit: CHILD_SPACES_PAGE_SIZE,
      });
      if (cancelled) return;
      setChildren(data?.children ?? []);
      setTotalPages(data?.pagination.totalPages || 1);
      setTotal(data?.pagination.total ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [space.id, page]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="inline-flex items-center gap-2">
              <Stack className="h-4 w-4 text-muted-foreground" />
              Child spaces
            </CardTitle>
            <CardDescription>
              {readOnly
                ? "Spaces under this super space. Open one to view its data."
                : "Spaces that belong to this super space."}
            </CardDescription>
          </div>
          {total > 0 && (
            <Badge variant="neutral">
              {total.toLocaleString("en-IN")}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-md" />
            ))}
          </div>
        ) : children.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No child spaces yet.
          </p>
        ) : (
          children.map((child) => (
            <Link
              key={child.id}
              href={`/dashboard/spaces/${child.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {child.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  /{child.slug} · {child.member_count.toLocaleString("en-IN")}{" "}
                  {child.member_count === 1 ? "member" : "members"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!child.is_active && (
                  <Badge variant="neutral">Inactive</Badge>
                )}
                <CaretRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </div>
            </Link>
          ))
        )}

        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <CaretLeft className="h-4 w-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <CaretRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Organiser-facing panel for parent/child hierarchy requests. Every action
 * here creates a `sub-space-request` that an admin must approve. The UI mirrors
 * the backend rules: a REGULAR space must be converted to SUPER before it can
 * accept children, and a SUPER space must have all children removed before it
 * can convert back to REGULAR.
 */
type HierarchyAction =
  | "CONVERT_TO_SUPER"
  | "CONVERT_TO_REGULAR"
  | "ASSIGN_PARENT"
  | "ASSIGN_CHILD"
  | "REMOVE_CHILD"
  | "REMOVE_PARENT";

/** Minimal shape the hierarchy picker needs from any candidate space. */
type HierarchyCandidate = {
  id: string;
  name: string;
  spaceKind: SpaceKind | undefined;
  parentSpaceId: string | null;
};

function OrganiserHierarchyPanel({
  space,
  isAdmin,
  onChange,
}: {
  space: SpaceWithHierarchy;
  isAdmin: boolean;
  onChange: () => Promise<void>;
}) {
  const [mySpaces, setMySpaces] = useState<HierarchyCandidate[]>([]);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [action, setAction] = useState<HierarchyAction | "">("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [done, setDone] = useState(false);

  const isSuper = space.spaceKind === "SUPER";
  const hasParent = Boolean(space.parentSpaceId);
  const childCount = space.sub_org_count ?? 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSpaces(true);
      // Admins may attach ANY space in the platform, so pull the full admin
      // list. Organisers can only work with spaces they belong to.
      if (isAdmin) {
        const { data } = await getAllSpacesAdmin({ page: 1, limit: 500 });
        if (cancelled) return;
        const candidates: HierarchyCandidate[] = (data?.spaces ?? []).map(
          (s) => ({
            id: s.id,
            name: s.name,
            spaceKind: s.type,
            parentSpaceId: s.parent_space_id,
          })
        );
        setMySpaces(candidates);
      } else {
        const { data } = await getMySpaces();
        if (cancelled) return;
        const candidates: HierarchyCandidate[] = (data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          spaceKind: s.spaceKind,
          parentSpaceId: s.parentSpaceId ?? null,
        }));
        setMySpaces(candidates);
      }
      setLoadingSpaces(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Walk the parent chain of a candidate to decide whether THIS space is one
  // of its ancestors. Used to prevent cycles when picking a parent.
  const isDescendantOfThis = useMemo(() => {
    const byId = new Map(mySpaces.map((s) => [s.id, s]));
    return (candidate: HierarchyCandidate): boolean => {
      let cursor: string | null = candidate.parentSpaceId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === space.id) return true;
        if (seen.has(cursor)) break;
        seen.add(cursor);
        cursor = byId.get(cursor)?.parentSpaceId ?? null;
      }
      return false;
    };
  }, [mySpaces, space.id]);

  // Spaces that can become a child of THIS space. A space may be a sub-space
  // only of a SUPER space, so this list is meaningful once this space is (or
  // becomes) SUPER. Both SUPER and REGULAR spaces may be attached as children,
  // provided they don't already have a parent (one-parent rule) and aren't
  // this space itself.
  const childCandidates = useMemo(
    () => mySpaces.filter((s) => s.id !== space.id && !s.parentSpaceId),
    [mySpaces, space.id]
  );

  // Spaces THIS space could join under as a sub-space. A parent must be a
  // SUPER space; a REGULAR candidate is auto-promoted to SUPER first
  // (CONVERT_AND_JOIN) since a REGULAR space cannot be a parent. Exclude this
  // space itself and any of its descendants to avoid creating a cycle.
  const parentCandidates = useMemo(
    () =>
      mySpaces.filter(
        (s) => s.id !== space.id && !isDescendantOfThis(s)
      ),
    [mySpaces, space.id, isDescendantOfThis]
  );

  // Current children of this space (derived from the organiser's spaces).
  const currentChildren = useMemo(
    () => mySpaces.filter((s) => s.parentSpaceId === space.id),
    [mySpaces, space.id]
  );

  // Which actions are available given the current state.
  const availableActions = useMemo<
    { value: HierarchyAction; label: string }[]
  >(() => {
    const list: { value: HierarchyAction; label: string }[] = [];
    // A REGULAR space can be promoted to SUPER so it can hold sub-spaces. This
    // is allowed even when the space already has a (SUPER) parent, since a
    // SUPER space is permitted to be a sub-space of another SUPER space.
    if (!isSuper) {
      list.push({ value: "CONVERT_TO_SUPER", label: "Convert to Super" });
    }
    // Any space with no parent yet can be attached under a SUPER space — this
    // applies to both REGULAR and SUPER spaces (one-parent rule).
    if (!hasParent) {
      list.push({ value: "ASSIGN_PARENT", label: "Assign a parent space" });
    }
    // Only a SUPER space can be a parent, so child management is SUPER-only.
    if (isSuper) {
      list.push({ value: "ASSIGN_CHILD", label: "Assign a child space" });
      if (childCount > 0) {
        list.push({ value: "REMOVE_CHILD", label: "Remove a child space" });
      }
      // A SUPER space can drop back to REGULAR only when it has no children.
      if (childCount === 0) {
        list.push({
          value: "CONVERT_TO_REGULAR",
          label: "Convert back to Regular",
        });
      }
    }
    if (hasParent) {
      list.push({ value: "REMOVE_PARENT", label: "Remove parent space" });
    }
    return list;
  }, [isSuper, hasParent, childCount]);

  // Does the current action require picking another space?
  const needsSpacePicker =
    action === "ASSIGN_PARENT" ||
    action === "ASSIGN_CHILD" ||
    action === "REMOVE_CHILD";

  const pickerOptions =
    action === "ASSIGN_PARENT"
      ? parentCandidates
      : action === "ASSIGN_CHILD"
      ? childCandidates
      : action === "REMOVE_CHILD"
      ? currentChildren
      : [];

  function resetForm() {
    setAction("");
    setSelectedSpaceId("");
    setReason("");
  }

  async function submit() {
    if (!action) return;
    setBusy(true);
    setActionError("");
    setDone(false);

    // Map the UI action → backend request payload.
    let requestType: SubSpaceRequestType;
    let targetSpaceId: string;
    let subSpaceId: string | undefined;

    if (action === "CONVERT_TO_SUPER") {
      requestType = "CONVERT_TO_SUPER";
      targetSpaceId = space.id;
    } else if (action === "CONVERT_TO_REGULAR") {
      requestType = "CONVERT_TO_REGULAR";
      targetSpaceId = space.id;
    } else if (action === "ASSIGN_PARENT") {
      // This space joins the selected parent. If the parent is not yet SUPER,
      // the backend handles it via CONVERT_AND_JOIN.
      const parent = parentCandidates.find((s) => s.id === selectedSpaceId);
      requestType =
        parent?.spaceKind === "SUPER" ? "JOIN_SUPER" : "CONVERT_AND_JOIN";
      targetSpaceId = selectedSpaceId;
      subSpaceId = space.id;
    } else if (action === "ASSIGN_CHILD") {
      // The selected space joins THIS space as a child.
      requestType = "JOIN_SUPER";
      targetSpaceId = space.id;
      subSpaceId = selectedSpaceId;
    } else if (action === "REMOVE_CHILD") {
      requestType = "REMOVE_CHILD";
      targetSpaceId = space.id;
      subSpaceId = selectedSpaceId;
    } else {
      // REMOVE_PARENT
      requestType = "REMOVE_PARENT";
      targetSpaceId = space.parentSpaceId as string;
      subSpaceId = space.id;
    }

    const { error } = await createSubSpaceRequest({
      requestType,
      targetSpaceId,
      subSpaceId,
      reason: reason.trim() || "Requested from space management",
    });

    if (error) {
      setActionError(error.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    setDone(true);
    resetForm();
    await onChange();
  }

  const canSubmit =
    !!action && !busy && (!needsSpacePicker || !!selectedSpaceId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2">
          <TreeStructure className="h-4 w-4 text-muted-foreground" />
          Space hierarchy
        </CardTitle>
        <CardDescription>
          Request parent/child changes. An admin reviews each request before it
          takes effect.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current relationship summary. */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={isSuper ? "brand" : "neutral"}>
              {isSuper ? "Super" : "Regular"}
            </Badge>
            {isSuper && (
              <span className="text-muted-foreground">
                {childCount} child {childCount === 1 ? "space" : "spaces"}
              </span>
            )}
          </div>
          {space.parentSpace && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-muted-foreground">
              <ArrowUp className="h-3.5 w-3.5" />
              Parent:{" "}
              <span className="text-foreground">{space.parentSpace.name}</span>
            </p>
          )}
        </div>

        {actionError && <ErrorNotice message={actionError} />}
        {done && (
          <div className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            <CheckCircle className="h-4 w-4" weight="fill" />
            Request submitted for admin review.
          </div>
        )}

        {loadingSpaces ? (
          <Skeleton className="h-10 rounded-md" />
        ) : availableActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hierarchy actions are available for this space right now.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="hierarchy-action">Action</Label>
              <Select
                value={action}
                onValueChange={(v) => {
                  setAction(v as HierarchyAction);
                  setSelectedSpaceId("");
                  setDone(false);
                }}
                disabled={busy}
              >
                <SelectTrigger id="hierarchy-action">
                  <SelectValue placeholder="Choose an action" />
                </SelectTrigger>
                <SelectContent>
                  {availableActions.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsSpacePicker && (
              <div className="space-y-1.5">
                <Label htmlFor="hierarchy-space">
                  {action === "ASSIGN_PARENT"
                    ? "Parent space"
                    : action === "ASSIGN_CHILD"
                    ? "Child space"
                    : "Space to remove"}
                </Label>
                {pickerOptions.length === 0 ? (
                  action === "ASSIGN_CHILD" ? (
                    <p className="text-sm text-muted-foreground">
                      There&rsquo;s no limit on how many child spaces you can
                      add. Each space can only belong to one parent, so a space
                      is available to attach here only while it has no parent of
                      its own. To add another child,{" "}
                      <Link
                        href="/dashboard/spaces"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        create a new space
                      </Link>{" "}
                      or detach one from its current parent first.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {action === "ASSIGN_PARENT"
                        ? "You don't have another space this one can join as a sub-space."
                        : "No child spaces to remove."}
                    </p>
                  )
                ) : (
                  <>
                    <Select
                      value={selectedSpaceId}
                      onValueChange={setSelectedSpaceId}
                      disabled={busy}
                    >
                      <SelectTrigger id="hierarchy-space">
                        <SelectValue placeholder="Select a space" />
                      </SelectTrigger>
                      <SelectContent>
                        {pickerOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            {s.spaceKind === "SUPER" ? " · Super" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {action === "ASSIGN_PARENT" && (
                      <p className="text-xs text-muted-foreground">
                        Only a Super space can be a parent. If you pick a Regular
                        space, it is promoted to Super before this space joins
                        it.
                      </p>
                    )}
                    {action === "ASSIGN_CHILD" && (
                      <p className="text-xs text-muted-foreground">
                        Both Super and Regular spaces can join this Super space
                        as sub-spaces.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {action && (
              <div className="space-y-1.5">
                <Label htmlFor="hierarchy-reason">Reason (optional)</Label>
                <Input
                  id="hierarchy-reason"
                  placeholder="Why is this change needed?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={busy}
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button disabled={!canSubmit} onClick={submit}>
                {action === "REMOVE_CHILD" || action === "REMOVE_PARENT" ? (
                  <LinkBreak className="h-4 w-4" />
                ) : action === "ASSIGN_CHILD" ? (
                  <ArrowDown className="h-4 w-4" />
                ) : action === "ASSIGN_PARENT" ? (
                  <ArrowUp className="h-4 w-4" />
                ) : (
                  <TreeStructure className="h-4 w-4" />
                )}
                Submit request
              </Button>
              {action && (
                <Button variant="ghost" disabled={busy} onClick={resetForm}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
