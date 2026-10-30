"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Warning } from "@unifesto/unicon/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPlatformConfig, updatePlatformConfig } from "@/lib/api/subscriptions-api";

/** An on/off platform switch. Saves on click, on its own. */
export function FlagCard({
  field,
  title,
  children,
  risky,
}: {
  field: "appReviewLoginEnabled" | "requireAgeConfirmation" | "customSendingDomainsEnabled";
  title: string;
  children: ReactNode;
  /** Colour "On" as the dangerous state (otherwise "Off" is). */
  risky: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlatformConfig().then(({ data, error }) => {
      if (error) setError(error.message || "Failed to load");
      else if (data) setEnabled(data[field]);
    });
  }, [field]);

  const toggle = async () => {
    if (enabled === null) return;
    setBusy(true);
    setError(null);
    const { data, error } = await updatePlatformConfig({ [field]: !enabled });
    if (error) setError(error.message || "Failed to save");
    else if (data) setEnabled(data[field]);
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Warning className="h-5 w-5" weight="fill" /> {title}
        </CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        {enabled === null && !error ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          <p className="text-sm">
            Status:{" "}
            <span
              className={`font-semibold ${enabled === risky ? "text-destructive" : "text-success"}`}
            >
              {enabled ? "On" : "Off"}
            </span>
          </p>
        )}
        <Button
          aria-pressed={!!enabled}
          variant={enabled ? "default" : "outline"}
          onClick={toggle}
          disabled={busy || enabled === null}
        >
          {busy ? "Saving" : enabled ? "Turn off" : "Turn on"}
        </Button>
        {error && <p className="w-full text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
