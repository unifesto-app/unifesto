"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeviceMobile,
  AppleLogo,
  AndroidLogo,
  CheckCircle,
  ArrowClockwise,
  Warning,
} from "@phosphor-icons/react";
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

  const latestValid = VERSION_RE.test(value.latestVersion);
  const minimumValid = VERSION_RE.test(value.minimumVersion);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Logo className="h-5 w-5" weight="fill" /> {label}
        </CardTitle>
        <CardDescription>
          Below <span className="font-medium">minimum</span> forces an update;
          below <span className="font-medium">latest</span> shows an optional
          prompt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${platform}-latest`}>Latest version</Label>
            <Input
              id={`${platform}-latest`}
              value={value.latestVersion}
              placeholder="2.1.0"
              onChange={(e) =>
                onChange({ ...value, latestVersion: e.target.value.trim() })
              }
            />
            {!latestValid && value.latestVersion.length > 0 && (
              <p className="text-xs text-destructive">
                Use a dotted version like 2.1.0
              </p>
            )}
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
            {!minimumValid && value.minimumVersion.length > 0 && (
              <p className="text-xs text-destructive">
                Use a dotted version like 2.0.0
              </p>
            )}
          </div>
        </div>
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
      (p) =>
        VERSION_RE.test(config[p].latestVersion) &&
        VERSION_RE.test(config[p].minimumVersion) &&
        config[p].storeUrl.trim().length > 0
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
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
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
