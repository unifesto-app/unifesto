"use client";

import { useSession } from "@/lib/context/SessionContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * `/dashboard/profile` — a read-only view of the signed-in account. Pulls
 * everything from the session (no extra fetch) and mirrors the shell's avatar
 * treatment: image when available, initials otherwise.
 * 
 * Note: The AppShell provides padding wrapper for non-space routes, but we
 * include responsive padding here to ensure proper spacing on all screen sizes.
 */
export default function ProfilePage() {
  const { user, role, spaces, loading } = useSession();

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  if (!user) return null;

  const initials = (user.name?.[0] ?? "U").toUpperCase();

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Profile</h1>
        <p className="text-sm text-muted-foreground">
          Your account details and access on Unifesto.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url}
                alt={user.name}
                width={64}
                height={64}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft text-xl font-semibold text-primary">
                {initials}
              </span>
            )}
            <div className="space-y-1">
              <CardTitle className="text-xl">{user.name}</CardTitle>
              {role === "platform_admin" && <Badge variant="brand">Platform Admin</Badge>}
              {role === "employee" && <Badge variant="brand">Employee</Badge>}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Detail label="Name" value={user.name} />
          {user.username && <Detail label="Username" value={user.username} />}
          <Detail label="Mobile number" value={user.email} />

          {spaces && spaces.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Space memberships
              </p>
              <div className="flex flex-wrap gap-2">
                {spaces.map((space) => (
                  <Badge key={space.id} variant="neutral">
                    {space.name}
                    {space.userRole?.code ? ` · ${space.userRole.code}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
