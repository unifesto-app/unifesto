"use client";

import { AuditTrail } from "@/components/shared/AuditTrail";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Envelope,
  Phone,
  LinkedinLogo,
  InstagramLogo,
  GithubLogo,
  Globe,
  CheckCircle,
  XCircle,
  PencilSimple,
  FloppyDisk,
  Camera,
  Trash,
  CircleNotch,
  X,
} from "@unifesto/unicon/react";
import {
  getUser,
  updateUser,
  uploadUserAvatar,
  removeUserAvatar,
  setEmployee,
  type UpdateUserPayload,
  type UserDetail,
} from "@/lib/api/admin-users-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLastSeen, lastSeenTitle } from "@/lib/utils/last-seen";
import { MessageTable } from "@/components/messages/MessageTable";
import { confirmDialog } from "@/components/shared/ConfirmDialog";
import { EMPLOYEE_ROLE_CODE } from "@/lib/types/rbac";
import { UserActivity } from "@/components/users/UserActivity";
import { AccountAccessCard } from "@/components/users/AccountAccessCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function roleBadge(code: string, name?: string) {
  const label = (name || code).toLowerCase().replace(/_/g, " ");
  switch (code) {
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

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const PLATFORM_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
};

const SOCIALS: {
  key: keyof Pick<
    UserDetail,
    "linkedinUrl" | "instagramUrl" | "githubUrl" | "websiteUrl"
  >;
  label: string;
  Icon: React.ComponentType<{ className?: string; weight?: "duotone" }>;
}[] = [
  { key: "linkedinUrl", label: "LinkedIn", Icon: LinkedinLogo },
  { key: "instagramUrl", label: "Instagram", Icon: InstagramLogo },
  { key: "githubUrl", label: "GitHub", Icon: GithubLogo },
  { key: "websiteUrl", label: "Website", Icon: Globe },
];

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [form, setForm] = useState<UpdateUserPayload>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState("");

  const [employeeBusy, setEmployeeBusy] = useState(false);
  const [employeeError, setEmployeeError] = useState("");
  const isEmployee = !!user?.roles.some((r) => r.code === EMPLOYEE_ROLE_CODE);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error } = await getUser(id);
    if (error) setError(error.message);
    else if (data) setUser(data.user);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEmployee = useCallback(async () => {
    const enable = !isEmployee;
    const ok = await confirmDialog({
      title: enable ? "Make this user an employee?" : "Remove employee access?",
      description: enable
        ? "They can open the Product board in Apex. Restricted company items stay hidden unless their role is granted company:view-restricted."
        : "They lose employee access to Apex.",
      confirmLabel: enable ? "Make employee" : "Remove",
      destructive: !enable,
    });
    if (!ok) return;
    setEmployeeBusy(true);
    setEmployeeError("");
    const { error } = await setEmployee(id, enable);
    setEmployeeBusy(false);
    if (error) return setEmployeeError(error.message);
    void load();
  }, [id, isEmployee, load]);

  const startEdit = useCallback(() => {
    if (!user) return;
    setForm({
      fullName: user.fullName ?? "",
      username: user.username ?? "",
      bio: user.bio ?? "",
      linkedinUrl: user.linkedinUrl ?? "",
      instagramUrl: user.instagramUrl ?? "",
      githubUrl: user.githubUrl ?? "",
      websiteUrl: user.websiteUrl ?? "",
    });
    setSaveError("");
    setEditing(true);
  }, [user]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    setSaveError("");
    // Send only changed fields. A cleared optional field goes as null so it
    // actually clears; name and username can't be blank.
    const payload: Record<string, string | null> = {};
    for (const key of Object.keys(form) as (keyof UpdateUserPayload)[]) {
      const value = form[key]?.trim() ?? "";
      const current = (user?.[key] as string | null | undefined) ?? "";
      if (value === current) continue;
      if (!value && (key === "fullName" || key === "username")) {
        setSaveError(key === "fullName" ? "Name can't be blank." : "Username can't be blank.");
        setSaving(false);
        return;
      }
      payload[key] = value || null;
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setSaving(false);
      return;
    }

    const { data, error } = await updateUser(id, payload as UpdateUserPayload);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    if (data) setUser(data.user);
    setEditing(false);
    void load();
  }, [form, id, load, user]);

  const onPickAvatar = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so re-selecting the same file still fires onChange.
      e.target.value = "";
      if (!file) return;
      setAvatarBusy(true);
      setAvatarError("");
      const { data, error } = await uploadUserAvatar(id, file);
      setAvatarBusy(false);
      if (error) {
        setAvatarError(error.message);
        return;
      }
      if (data) setUser((u) => (u ? { ...u, avatarUrl: data.avatarUrl } : u));
    },
    [id]
  );

  const onRemoveAvatar = useCallback(async () => {
    setAvatarBusy(true);
    setAvatarError("");
    const { error } = await removeUserAvatar(id);
    setAvatarBusy(false);
    if (error) {
      setAvatarError(error.message);
      return;
    }
    setUser((u) => (u ? { ...u, avatarUrl: null } : u));
  }, [id]);

  const displayName = user?.fullName || user?.username || "Unnamed user";
  const initial = (user?.fullName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();
  const activeSocials = user
    ? SOCIALS.filter((s) => user[s.key])
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/users")}
          className="-ml-2 mb-3 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </Button>
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : error ? (
        <Card className="rounded-lg border border-destructive/30 bg-destructive-soft px-4">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void load()}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : user ? (
        <>
          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-shrink-0 flex-col items-center gap-1.5">
              <div className="group relative h-16 w-16">
                <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-secondary text-xl font-semibold text-secondary-foreground">
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initial
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy}
                  aria-label={user.avatarUrl ? "Change photo" : "Add photo"}
                  title={user.avatarUrl ? "Change photo" : "Add photo"}
                  className="absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-150 focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 disabled:cursor-not-allowed"
                >
                  {avatarBusy ? (
                    <CircleNotch className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickAvatar}
                />
              </div>
              {user.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void onRemoveAvatar()}
                  disabled={avatarBusy}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {displayName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {user.username ? `@${user.username}` : "No username"} · Joined{" "}
                {fmtDate(user.createdAt)}
              </p>
              {avatarError && (
                <p className="mt-1 text-xs text-destructive">
                  {avatarError}
                </p>
              )}
            </div>
            {!editing && (
              <Button
                variant="outline"
                size="sm"
                onClick={startEdit}
                className="flex-shrink-0 gap-1.5"
              >
                <PencilSimple className="h-4 w-4" />
                Edit profile
              </Button>
            )}
          </div>

          {/* Edit form */}
          {editing && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Edit profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-fullName">Full name</Label>
                    <Input
                      id="edit-fullName"
                      value={form.fullName ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, fullName: e.target.value }))
                      }
                      placeholder="Full name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-username">Username</Label>
                    <Input
                      id="edit-username"
                      value={form.username ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      placeholder="username"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-bio">Bio</Label>
                  <textarea
                    id="edit-bio"
                    value={form.bio ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bio: e.target.value }))
                    }
                    rows={3}
                    placeholder="Short bio"
                    className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-150 ease-standard focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-linkedin">LinkedIn URL</Label>
                    <Input
                      id="edit-linkedin"
                      type="url"
                      value={form.linkedinUrl ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, linkedinUrl: e.target.value }))
                      }
                      placeholder="https://linkedin.com/in/…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-instagram">Instagram URL</Label>
                    <Input
                      id="edit-instagram"
                      type="url"
                      value={form.instagramUrl ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, instagramUrl: e.target.value }))
                      }
                      placeholder="https://instagram.com/…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-github">GitHub URL</Label>
                    <Input
                      id="edit-github"
                      type="url"
                      value={form.githubUrl ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, githubUrl: e.target.value }))
                      }
                      placeholder="https://github.com/…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-website">Website URL</Label>
                    <Input
                      id="edit-website"
                      type="url"
                      value={form.websiteUrl ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, websiteUrl: e.target.value }))
                      }
                      placeholder="https://…"
                    />
                  </div>
                </div>
                {saveError && (
                  <p className="text-sm text-destructive">{saveError}</p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => void saveEdit()}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <FloppyDisk className="h-4 w-4" />
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="gap-1.5"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Contact */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <ContactRow
                  Icon={Envelope}
                  label="Email"
                  value={user.email}
                  verified={user.emailVerified}
                />
                <ContactRow
                  Icon={Phone}
                  label="Mobile"
                  value={user.mobileNumber}
                  verified={user.mobileVerified}
                />
              </CardContent>
            </Card>

            {/* Profile */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Bio
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {user.bio || (
                      <span className="text-muted-foreground">
                        No bio provided.
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Links
                  </p>
                  {activeSocials.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {activeSocials.map(({ key, label, Icon }) => (
                        <a
                          key={key}
                          href={user[key] as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-muted"
                        >
                          <Icon className="h-4 w-4" />
                          {label}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No links added.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Last seen
                  </p>
                  <p
                    className="mt-1 text-sm text-foreground"
                    title={lastSeenTitle(user.lastSeenAt)}
                  >
                    {formatLastSeen(user.lastSeenAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    App version
                  </p>
                  {user.appVersion ? (
                    <p className="mt-1 text-sm text-foreground">
                      <span className="font-medium tabular-nums">
                        v{user.appVersion}
                      </span>
                      {user.appPlatform && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {PLATFORM_LABEL[user.appPlatform] ?? user.appPlatform}
                        </span>
                      )}
                      {user.appVersionLastReportedAt && (
                        <span className="text-muted-foreground">
                          {" "}
                          · reported {fmtDate(user.appVersionLastReportedAt)}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Not reported yet.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Roles */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
              <CardTitle className="text-base">
                Roles ({user.roles.length})
              </CardTitle>
              <Button
                size="sm"
                variant={isEmployee ? "outline" : "default"}
                onClick={() => void toggleEmployee()}
                disabled={employeeBusy}
              >
                {employeeBusy && <CircleNotch className="mr-1.5 h-4 w-4 animate-spin" />}
                {isEmployee ? "Remove employee" : "Make employee"}
              </Button>
            </CardHeader>
            <CardContent className="pt-2">
              {employeeError && (
                <p className="mb-3 text-sm text-destructive">{employeeError}</p>
              )}
              {user.roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No roles assigned.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Role</th>
                        <th className="pb-2 pr-4 font-medium">Scope</th>
                        <th className="pb-2 pr-4 font-medium">Assigned by</th>
                        <th className="pb-2 font-medium">Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {user.roles.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-border/60 last:border-0"
                        >
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-2">
                              {roleBadge(r.code, r.name)}
                              <span className="text-muted-foreground">
                                {r.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {r.scope}
                            {r.spaceName
                              ? ` · ${r.spaceName}`
                              : r.spaceId
                                ? ` · ${r.spaceId}`
                                : ""}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {r.assignedBy?.fullName ||
                              r.assignedBy?.username ||
                              "—"}
                          </td>
                          <td className="py-3 text-muted-foreground">
                            {fmtDate(r.assignedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <AccountAccessCard user={user} onChanged={() => void load()} />

          {/* Push devices */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Push devices ({user.pushDevices?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {!user.pushDevices?.length ? (
                <p className="text-sm text-muted-foreground">
                  No devices registered. The user hasn&apos;t opened a build
                  that reports its device yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {user.pushDevices.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {d.deviceModel || "Unknown device"}
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {PLATFORM_LABEL[d.platform] ?? d.platform}
                            {d.appVersion && ` · v${d.appVersion}`}
                          </span>
                        </p>
                        <p
                          className="truncate font-mono text-xs text-muted-foreground"
                          title="OneSignal subscription id"
                        >
                          {d.subscriptionId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Last seen {fmtDate(d.lastSeenAt)}
                          {d.linkedAt && ` · linked ${fmtDate(d.linkedAt)}`}
                        </p>
                        {!d.linkedAt && d.linkError && (
                          <p className="truncate text-xs text-destructive" title={d.linkError}>
                            Link failed: {d.linkError}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {d.linkedAt ? (
                          <Badge variant="success">linked</Badge>
                        ) : (
                          <Badge variant="warning">not linked</Badge>
                        )}
                        {d.optedIn ? (
                          <Badge variant="success">push on</Badge>
                        ) : (
                          <Badge variant="outline">push off</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <UserActivity userId={id} />

          {/* Identities */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Linked identities ({user.identities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {user.identities.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked identities.
                </p>
              ) : (
                <div className="space-y-2">
                  {user.identities.map((idn) => (
                    <div
                      key={idn.id}
                      className="flex items-center justify-between rounded-md border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium capitalize text-foreground">
                          {idn.provider.toLowerCase()}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {idn.email || "—"}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {idn.isPrimary && (
                          <Badge variant="brand">primary</Badge>
                        )}
                        {idn.emailVerified ? (
                          <Badge variant="success">verified</Badge>
                        ) : (
                          <Badge variant="warning">unverified</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AuditTrail filter={{ userId: id }} />

          {/* Messages (C6): everything sent to this account, by id or address */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Messages</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <MessageTable filters={{ userId: id }} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function ContactRow({
  Icon,
  label,
  value,
  verified,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  verified: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {label}
        </p>
        {value ? (
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm text-foreground">{value}</p>
            {verified ? (
              <CheckCircle
                className="h-4 w-4 flex-shrink-0 text-success"
                weight="fill"
              />
            ) : (
              <XCircle
                className="h-4 w-4 flex-shrink-0 text-warning"
                weight="fill"
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not provided</p>
        )}
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl lg:col-span-2" />
      </div>
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}
