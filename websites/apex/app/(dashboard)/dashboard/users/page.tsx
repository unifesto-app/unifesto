"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Download, MagnifyingGlass, Users as UsersIcon } from "@unifesto/unicon/react";
import { getUsers, type User } from "@/lib/api/admin-users-api";
import { formatLastSeen, lastSeenTitle } from "@/lib/utils/last-seen";
import { downloadCsv } from "@/lib/utils/csv";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PAGE_SIZE = 20;

const ROLE_PRIORITY = ["ADMIN", "SPACE_ADMIN", "CURATOR", "CO_CURATOR", "CREW", "MEMBER"];

function primaryRole(roles: string[]): string | null {
  for (const code of ROLE_PRIORITY) {
    if (roles.includes(code)) return code;
  }
  return roles[0] ?? null;
}

const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

/** Render the self-reported app version + platform, or a muted dash when unknown. */
function versionCell(u: User) {
  if (!u.appVersion) {
    return <span className="text-muted-foreground">—</span>;
  }
  const platform = u.appPlatform ? PLATFORM_LABEL[u.appPlatform] ?? u.appPlatform : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-medium tabular-nums text-foreground">v{u.appVersion}</span>
      {platform && (
        <span className="text-xs text-muted-foreground">{platform}</span>
      )}
    </span>
  );
}

/** Reachable push devices out of all registered ones, or a muted dash. */
function pushCell(u: User) {
  const d = u.pushDevices;
  if (!d || d.total === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Badge
      variant={d.reachable > 0 ? "success" : "warning"}
      title={`${d.reachable} of ${d.total} device${d.total === 1 ? "" : "s"} can receive push`}
    >
      {d.reachable}/{d.total} reachable
    </Badge>
  );
}

function roleBadge(roles: string[]) {
  const role = primaryRole(roles);
  if (!role) return <Badge variant="outline">User</Badge>;
  const label = role.toLowerCase().replace(/_/g, " ");
  switch (role) {
    case "ADMIN":
    case "SPACE_ADMIN":
      return <Badge variant="brand">{label}</Badge>;
    case "CURATOR":
    case "CO_CURATOR":
      return <Badge variant="neutral">{label}</Badge>;
    case "CREW":
      return <Badge variant="warning">{label}</Badge>;
    default:
      return <Badge variant="outline">{label}</Badge>;
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  // Debounce search input to avoid a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getUsers({
      page,
      limit: PAGE_SIZE,
      search: debounced || undefined,
    });
    if (error) setError(error.message);
    else if (data) {
      setUsers(data.users);
      setTotalPages(data.pagination.totalPages || 1);
      setTotal(data.pagination.total);
    }
    setLoading(false);
  }, [page, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every account matching the search, not just this page. */
  const exportCsv = async () => {
    setExporting(true);
    setError("");
    const rows: User[] = [];
    for (let p = 1; ; p++) {
      const { data, error } = await getUsers({ page: p, limit: 500, search: debounced || undefined });
      if (error || !data) {
        setError(error?.message ?? "Export failed");
        setExporting(false);
        return;
      }
      rows.push(...data.users);
      if (p >= data.pagination.totalPages) break;
    }
    downloadCsv(
      `users-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Name", "Username", "Email", "Email Verified", "Mobile", "Mobile Verified", "Roles", "App Version", "Platform", "Last Seen", "Joined"],
      rows.map((u) => [
        u.fullName,
        u.username,
        u.email,
        u.emailVerified ? "Yes" : "No",
        u.mobileNumber,
        u.mobileVerified ? "Yes" : "No",
        u.roles.join("; "),
        u.appVersion,
        u.appPlatform,
        u.lastSeenAt,
        u.createdAt,
      ])
    );
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Users
        </h1>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading accounts…"
            : `${total.toLocaleString("en-IN")} account${total === 1 ? "" : "s"}`}
        </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting || loading || total === 0}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </header>

      <div className="relative max-w-sm">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or username"
          className="pl-9"
          aria-label="Search users"
        />
      </div>

      {error && (
        <Card className="rounded-2xl border border-destructive/30 bg-destructive-soft px-4">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <TableSkeleton />
          ) : users.length === 0 ? (
            <EmptyState hasSearch={Boolean(debounced)} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">#</th>
                    <th className="pb-2 pr-4 font-medium">User</th>
                    <th className="pb-2 pr-4 font-medium">Username</th>
                    <th className="pb-2 pr-4 font-medium">Role</th>
                    <th className="pb-2 pr-4 font-medium">App Version</th>
                    <th className="pb-2 pr-4 font-medium">Push</th>
                    <th className="pb-2 pr-4 font-medium">Last seen</th>
                    <th className="pb-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => {
                    const displayName = u.fullName || u.username || "—";
                    const contact = u.email || u.mobileNumber || "";
                    return (
                      <tr
                        key={u.id}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="py-3 pr-4 text-muted-foreground tabular-nums">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </td>
                        <td className="py-3 pr-4">
                          <Link
                            href={`/dashboard/users/${u.id}`}
                            className="flex items-center gap-3"
                          >
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={u.avatarUrl}
                                alt={displayName}
                                className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                                {(u.fullName?.[0] ?? u.email?.[0] ?? "U").toUpperCase()}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {displayName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {contact}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">
                          {u.username ? `@${u.username}` : "—"}
                        </td>
                        <td className="py-3 pr-4">{roleBadge(u.roles)}</td>
                        <td className="py-3 pr-4">{versionCell(u)}</td>
                        <td className="py-3 pr-4">{pushCell(u)}</td>
                        <td
                          className="py-3 pr-4 whitespace-nowrap text-muted-foreground"
                          title={lastSeenTitle(u.lastSeenAt)}
                        >
                          {formatLastSeen(u.lastSeenAt)}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {new Date(u.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && users.length > 0 && (
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

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <UsersIcon className="h-6 w-6" weight="duotone" />
      </span>
      <p className="text-sm font-medium text-foreground">
        {hasSearch ? "No matching users" : "No users yet"}
      </p>
      <p className="max-w-xs text-xs text-muted-foreground">
        {hasSearch
          ? "Try a different name, email, or username."
          : "Accounts will appear here as people join Unifesto."}
      </p>
    </div>
  );
}
