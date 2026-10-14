"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeviceMobile,
  AppleLogo,
  AndroidLogo,
  CheckCircle,
  ArrowClockwise,
  Warning,
} from "@unifesto/unicon/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  getAppVersion,
  updateAppVersion,
  type AppVersionConfig,
  type PlatformVersionInfo,
} from "@/lib/api/app-version-api";

const VERSION_RE = /^\d+(\.\d+){0,3}$/;
const ZERO_RE = /^0(\.0)*$/;

/** Empty latest = soft prompt off. Builds up to 4.x skip the minimum then too. */
function platformError(v: PlatformVersionInfo): string | null {
  if (v.latestVersion && !VERSION_RE.test(v.latestVersion))
    return "Use a dotted version like 2.1.0, or leave latest empty";
  if (!VERSION_RE.test(v.minimumVersion))
    return "Use a dotted version like 2.0.0";
  if (!v.latestVersion && !ZERO_RE.test(v.minimumVersion))
    return "Set a latest version before raising the minimum";
  if (!v.storeUrl.trim()) return "Store URL is required";
  return null;
}

type Platform = "ios" | "android";

/** Editor for one platform's version policy. */
function PlatformCard({
  platform,
  value,
  onChange,
}: {
  platform: Platform;
  value: PlatformVersionInfo;
  onChange: (next: PlatformVersionInfo) => void;
}) {
  const isIos = platform === "ios";
  const Logo = isIos ? AppleLogo : AndroidLogo;
  const label = isIos ? "iOS — App Store" : "Android — Play Store";

  const problem = platformError(value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Logo className="h-5 w-5" weight="fill" /> {label}
        </CardTitle>
        <CardDescription>
          Below <span className="font-medium">minimum</span> forces an update;
          below <span className="font-medium">latest</span> shows a dismissible
          prompt, once per version. Leave latest empty to show none.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-latest`}>Latest version</Label>
            <Input
              id={`${platform}-latest`}
              value={value.latestVersion}
              placeholder="Empty = no prompt"
              onChange={(e) =>
                onChange({ ...value, latestVersion: e.target.value.trim() })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-minimum`}>Minimum version</Label>
            <Input
              id={`${platform}-minimum`}
              value={value.minimumVersion}
              placeholder="2.0.0"
              onChange={(e) =>
                onChange({ ...value, minimumVersion: e.target.value.trim() })
              }
            />
          </div>
        </div>
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="space-y-1.5">
          <Label htmlFor={`${platform}-url`}>Store URL</Label>
          <Input
            id={`${platform}-url`}
            value={value.storeUrl}
            placeholder="https://…"
            onChange={(e) => onChange({ ...value, storeUrl: e.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AppVersionPage() {
  const [config, setConfig] = useState<AppVersionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await getAppVersion();
    if (error) setError(error.message || "Failed to load version config");
    else setConfig(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Every version field must be a valid dotted string before we allow a save.
  const allValid = useMemo(() => {
    if (!config) return false;
    return (["ios", "android"] as Platform[]).every(
      (p) => platformError(config[p]) === null
    );
  }, [config]);

  const setPlatform = (p: Platform, next: PlatformVersionInfo) => {
    setSaved(false);
    setConfig((c) => (c ? { ...c, [p]: next } : c));
  };

  const save = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { data, error } = await updateAppVersion(config);
    if (error) {
      setError(error.message || "Failed to save");
    } else {
      if (data) setConfig(data);
      setSaved(true);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="App Version"
        subtitle="Control the mobile app's in-app update prompt for each store."
        actions={
          <Button onClick={save} disabled={saving || loading || !allValid}>
            {saving ? (
              <>
                <ArrowClockwise className="h-4 w-4 animate-spin" /> Saving
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" weight="fill" /> Save changes
              </>
            )}
          </Button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <Warning className="h-4 w-4 shrink-0" weight="fill" />
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          <CheckCircle className="h-4 w-4 shrink-0" weight="fill" />
          Version policy saved. New app launches will see it immediately.
        </div>
      )}

      {loading || !config ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <PlatformCard
            platform="ios"
            value={config.ios}
            onChange={(next) => setPlatform("ios", next)}
          />
          <PlatformCard
            platform="android"
            value={config.android}
            onChange={(next) => setPlatform("android", next)}
          />
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <DeviceMobile className="mt-0.5 h-4 w-4 shrink-0" />
        Set <span className="font-medium">minimum</span> to a low value like
        0.0.0 to never force-update. Changes take effect on the next app launch
        (the app re-reads this on startup).
      </p>
    </div>
  );
}
