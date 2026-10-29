"use client";

import { useSpaceId } from "@/console/lib/hooks/useSpaceId";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Users,
  UsersThree,
  ShieldCheck,
  User,
  UserPlus,
  MagnifyingGlass,
  Trash,
  Plus,
  X,
  Download,
} from "@unifesto/unicon/react";
import { useSession } from "@/console/lib/context/SessionContext";
import {
  getSpaceMembers,
  searchAddableUsers,
  addSpaceMember,
  updateSpaceMemberRole,
  removeSpaceMember,
  getSpace,
  getMyOwnershipRequests,
  createOwnershipRequest,
  type SpaceMember,
  type SpaceMemberRoleCode,
  type AddableUser,
  type SpaceOwnershipRequest,
} from "@/console/lib/api/spaces-api";
import { downloadCsv } from "@/console/lib/utils/csv";
import { Pager } from "@/console/components/shared/ListControls";
import { PageHeader } from "@/console/components/shared/PageHeader";
import { StatCard } from "@/console/components/shared/StatCard";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import { Badge } from "@/console/components/ui/badge";
import { Button } from "@/console/components/ui/button";
import { Skeleton } from "@/console/components/ui/skeleton";
import { Input } from "@/console/components/ui/input";
import { Label } from "@/console/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/console/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";

const MEMBERS_PAGE_SIZE = 20;

// The space-membership roles, highest privilege first.
const SPACE_ROLE_ORDER: SpaceMemberRoleCode[] = ["SPACE_ADMIN", "MEMBER"];

const SPACE_ROLE_LABEL: Record<SpaceMemberRoleCode, string> = {
  SPACE_ADMIN: "Space Admin",
  MEMBER: "Member",
};

const SPACE_ROLE_VARIANT: Record<
  SpaceMemberRoleCode,
  "brand" | "neutral" | "success" | "outline" | "destructive"
> = {
  SPACE_ADMIN: "brand",
  MEMBER: "outline",
};

function initials(name?: string | null, username?: string | null): string {
  const text = name || username || "?";
  const parts = text.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return text.substring(0, 2).toUpperCase();
}

function formatDate(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

export default function SpaceMembersPage() {
  const spaceId = useSpaceId();
  const { user, can } = useSession();

  // Flat admin model: whoever manages members (Space Admins, platform admins)
  // can grant/revoke both admin and member.
  const canManageMembers = can("space:manage-members");
  const assignable: SpaceMemberRoleCode[] = canManageMembers ? ["SPACE_ADMIN", "MEMBER"] : [];

  // The whole roster is fetched once and everything below (search, role filter,
  // pagination, the stat split) is derived from it in the client. A space
  // roster is small, so this is instant — and it sidesteps the server-side
  // member search entirely (which filters on a non-scalar email field).
  const [allMembers, setAllMembers] = useState<SpaceMember[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<SpaceMemberRoleCode | "all">("all");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Ownership lives on `space.createdBy`, which the session's space list does
  // not carry — it only comes back from a space detail fetch.
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<SpaceOwnershipRequest | null>(null);

  const isCreator = Boolean(user?.id && createdBy && user.id === createdBy);

  const loadOwnership = useCallback(async () => {
    // Kept as separate awaits rather than a Promise.all tuple: the two result
    // shapes differ, and the tuple widens `data` to a union that loses the
    // request type.
    const spaceRes = await getSpace(spaceId);
    if (spaceRes.data) setCreatedBy(spaceRes.data.createdBy ?? null);

    const reqRes = await getMyOwnershipRequests(spaceId);
    setTransfer(
      (reqRes.data ?? []).find((r) => r.status === "PENDING") ?? null
    );
  }, [spaceId]);

  useEffect(() => {
    void loadOwnership();
  }, [loadOwnership]);

  // Debounce only to avoid re-filtering a large list on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Any change to the query resets to the first page so results aren't hidden
  // past a now-shorter list.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError("");
    // No server-side search: pull the whole roster, a page at a time (the
    // backend caps a page at 100), and filter in the client.
    const all: SpaceMember[] = [];
    for (let page = 1; ; page++) {
      const { data, error } = await getSpaceMembers(spaceId, { page, limit: 100 });
      if (error) {
        setError(error.message);
        break;
      }
      all.push(...(data?.members ?? []));
      if (!data || page >= data.pagination.totalPages) break;
    }
    setAllMembers(all);
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const stats = useMemo(() => {
    const admins = allMembers.filter((m) => m.role.code === "SPACE_ADMIN").length;
    const plain = allMembers.filter((m) => m.role.code === "MEMBER").length;
    return { total: allMembers.length, admins, members: plain };
  }, [allMembers]);

  // Search (name / username / email) + role filter, applied client-side.
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return allMembers.filter((m) => {
      if (roleFilter !== "all" && m.role.code !== roleFilter) return false;
      if (!q) return true;
      const u = m.user;
      return (
        (u.fullName ?? "").toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [allMembers, debouncedSearch, roleFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const members = useMemo(
    () => filtered.slice((page - 1) * MEMBERS_PAGE_SIZE, page * MEMBERS_PAGE_SIZE),
    [filtered, page]
  );

  /** Reload the roster after a mutation; the stat strip and list both derive from it. */
  const reload = loadMembers;

  async function handleUpdateRole(m: SpaceMember, role: SpaceMemberRoleCode) {
    if (role === m.role.code) return;
    setRowBusy(m.id);
    setActionError("");
    const { error } = await updateSpaceMemberRole(spaceId, m.id, role);
    if (error) setActionError(error.message);
    else await reload();
    setRowBusy(null);
  }

  async function handleRemove(m: SpaceMember) {
    const label = m.user.fullName || m.user.username || "this member";
    if (!window.confirm(`Remove ${label} from this space?`)) return;
    setRowBusy(m.id);
    setActionError("");
    const { error } = await removeSpaceMember(spaceId, m.id);
    if (error) setActionError(error.message);
    else await reload();
    setRowBusy(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People"
        title="Members"
        subtitle="Manage who belongs to this space and what they can do."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={filtered.length === 0}
              onClick={() =>
                downloadCsv(
                  `members-${new Date().toISOString().slice(0, 10)}.csv`,
                  ["Name", "Username", "Email", "Role", "Joined"],
                  filtered.map((m) => [m.user.fullName, m.user.username, m.user.email, m.role.name, m.createdAt])
                )
              }
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            {canManageMembers && (
              <Button
                variant={showAdd ? "outline" : "default"}
                onClick={() => setShowAdd((v) => !v)}
              >
                {showAdd ? (
                  <>
                    <X className="h-4 w-4" weight="bold" />
                    Close
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4" weight="bold" />
                    Add member
                  </>
                )}
              </Button>
            )}
          </div>
        }
      />

      {/* Governance at a glance — the split matters (how many people hold the
          keys), so it leads the page. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          title="Total members"
          value={stats.total.toLocaleString("en-IN")}
          hint="Everyone in this space"
          icon={UsersThree}
          tone="brand"
          loading={allMembers.length === 0 && loading}
        />
        <StatCard
          title="Space Admins"
          value={stats.admins.toLocaleString("en-IN")}
          hint="Full control of the space"
          icon={ShieldCheck}
          tone="success"
          loading={allMembers.length === 0 && loading}
        />
        <StatCard
          title="Members"
          value={stats.members.toLocaleString("en-IN")}
          hint="Standard access"
          icon={User}
          loading={allMembers.length === 0 && loading}
        />
      </div>

      {canManageMembers && showAdd && (
        <AddMemberCard
          spaceId={spaceId}
          assignable={assignable}
          onAdded={async () => {
            await reload();
            setShowAdd(false);
          }}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Roster</CardTitle>
              <CardDescription>
                {total.toLocaleString("en-IN")}{" "}
                {total === 1 ? "person" : "people"}
                {roleFilter !== "all"
                  ? ` · ${SPACE_ROLE_LABEL[roleFilter]}`
                  : ""}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative w-full sm:w-56">
                <MagnifyingGlass className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search members…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={roleFilter}
                onValueChange={(v) =>
                  setRoleFilter(v as SpaceMemberRoleCode | "all")
                }
              >
                <SelectTrigger className="w-full sm:w-40" aria-label="Filter by role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {SPACE_ROLE_ORDER.map((r) => (
                    <SelectItem key={r} value={r}>
                      {SPACE_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              title={
                debouncedSearch || roleFilter !== "all"
                  ? "No matches"
                  : "No members yet"
              }
              description={
                debouncedSearch || roleFilter !== "all"
                  ? "Try a different name, or clear the role filter."
                  : "Add members to build out this space."
              }
              action={
                canManageMembers && !debouncedSearch && roleFilter === "all" ? (
                  <Button onClick={() => setShowAdd(true)}>
                    <UserPlus className="h-4 w-4" weight="bold" />
                    Add member
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {members.map((m) => {
                const roleCode = m.role.code as SpaceMemberRoleCode;
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
                          {m.user.username
                            ? `@${m.user.username}`
                            : m.user.email}
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
                        <Badge
                          variant={SPACE_ROLE_VARIANT[roleCode] ?? "outline"}
                        >
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

          {!loading && !error && (
            <Pager page={page} totalPages={totalPages} onPage={setPage} />
          )}
        </CardContent>
      </Card>

      {/* Only the creator can give the space away, and only when nothing is
          already in review. Rare and consequential, so it sits apart at the
          bottom rather than competing with day-to-day roster work. */}
      {isCreator && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Ownership</h2>
          <TransferOwnershipCard
            spaceId={spaceId}
            members={members}
            currentUserId={user?.id ?? ""}
            pending={transfer}
            onChanged={loadOwnership}
          />
        </section>
      )}
    </div>
  );
}

/**
 * Hand the space to another member, subject to admin approval.
 *
 * Shown only to the creator. Ownership is not in the role dropdown on purpose:
 * the backend refuses to move the creator through the role editor, because
 * ownership decides billing and final say, so it goes through a review instead
 * of a silent dropdown change.
 */
function TransferOwnershipCard({
  spaceId,
  members,
  currentUserId,
  pending,
  onChanged,
}: {
  spaceId: string;
  members: SpaceMember[];
  currentUserId: string;
  pending: SpaceOwnershipRequest | null;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // You cannot hand a space to yourself.
  const candidates = members.filter((m) => m.user.id !== currentUserId);

  const submit = async () => {
    if (!newOwnerId) {
      setErr("Choose who should take over the space.");
      return;
    }
    if (reason.trim().length < 10) {
      setErr("Tell the admin why you're handing this space over.");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await createOwnershipRequest({
      spaceId,
      newOwnerId,
      reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setOpen(false);
    setNewOwnerId("");
    setReason("");
    await onChanged();
  };

  if (pending) {
    const name =
      pending.newOwner?.fullName || pending.newOwner?.username || "another member";
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ownership transfer in review</CardTitle>
          <CardDescription>
            You&apos;ve asked to hand this space to {name}. An admin is
            reviewing it. Nothing changes until they approve, and you stay the
            owner until then.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer ownership</CardTitle>
        <CardDescription>
          Hand this space to another member. An admin reviews the request. On
          approval they become the space owner and you stay on as a Space Admin.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && <ErrorNotice message={err} />}

        {!open ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Transfer ownership
          </Button>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There&apos;s nobody to hand this space to yet. Add the person as a
            member first.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="handover-owner" className="text-xs">New owner</Label>
              <Select value={newOwnerId} onValueChange={setNewOwnerId}>
                <SelectTrigger id="handover-owner" className="sm:w-80">
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((m) => (
                    <SelectItem key={m.user.id} value={m.user.id}>
                      {m.user.fullName || m.user.username || m.user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="handover-reason" className="text-xs">Why are you handing it over?</Label>
              <textarea
                id="handover-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="e.g. I'm graduating and handing the club to next year's president."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={busy}>
                {busy ? "Sending…" : "Send for approval"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setErr("");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
              <Label id="members-selected-user-label">Selected user</Label>
              <div role="group" aria-labelledby="members-selected-user-label" className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
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
              <Label htmlFor="members-role">Role</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as SpaceMemberRoleCode)}
              >
                <SelectTrigger id="members-role">
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
                            setQuery("");
                            setResults([]);
                          }}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={u.avatarUrl}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              initials(u.fullName, u.username)
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {u.fullName || u.username || u.email}
                            </p>
                            {u.username && (
                              <p className="truncate text-xs text-muted-foreground">
                                @{u.username}
                              </p>
                            )}
                          </div>
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
