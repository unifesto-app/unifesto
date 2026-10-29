"use client";

import { inr } from "@/console/lib/utils/money";
import { useEffect, useState } from "react";
import { Check, LinkSimple } from "@unifesto/unicon/react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/console/components/ui/card";
import { Button } from "@/console/components/ui/button";
import {
  getRegistrationSources,
  type RegistrationSource,
  type RegistrationSources,
} from "@/console/lib/api/registrations-api";

const WEB_URL = "https://www.unifesto.app";

/**
 * Channels a curator typically promotes on. Each copies the public event link
 * tagged with that channel, so registrations it brings in show up as their own
 * row below.
 */
const CHANNELS = [
  { source: "instagram", medium: "social", label: "Instagram" },
  { source: "whatsapp", medium: "social", label: "WhatsApp" },
  { source: "linkedin", medium: "social", label: "LinkedIn" },
  { source: "email", medium: "email", label: "Email" },
] as const;

/** Readable label for a source bucket; the app's own share sheet has a fixed tag. */
function sourceLabel(s: RegistrationSource): string {
  if (!s.source) return "Direct";
  if (s.source === "unifesto_app") return "Shared from the app";
  const name = s.source.charAt(0).toUpperCase() + s.source.slice(1);
  return s.medium === "partner" ? `${name} (partner)` : name;
}

function taggedLink(slug: string, source: string, medium: string): string {
  const q = new URLSearchParams({
    utm_source: source,
    utm_medium: medium,
    utm_campaign: slug,
  });
  return `${WEB_URL}/event/${slug}?${q.toString()}`;
}

export function RegistrationSourcesCard({
  eventId,
  slug,
}: {
  eventId: string;
  slug: string;
}) {
  const [data, setData] = useState<RegistrationSources | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void getRegistrationSources(eventId).then(({ data }) => {
      if (live && data) setData(data);
    });
    return () => {
      live = false;
    };
  }, [eventId]);

  const copy = async (source: string, medium: string) => {
    try {
      await navigator.clipboard.writeText(taggedLink(slug, source, medium));
      setCopied(source);
      setTimeout(() => setCopied((c) => (c === source ? null : c)), 1800);
    } catch {
      window.prompt("Copy this link", taggedLink(slug, source, medium));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Where bookings came from</CardTitle>
        <CardDescription>
          Share a tagged link on each channel to see which one brings people in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 py-4">
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c.source}
              variant="outline"
              size="sm"
              onClick={() => copy(c.source, c.medium)}
            >
              {copied === c.source ? (
                <Check className="h-4 w-4" />
              ) : (
                <LinkSimple className="h-4 w-4" />
              )}
              {copied === c.source ? "Copied" : `${c.label} link`}
            </Button>
          ))}
        </div>

        {data && data.total > 0 ? (
          <ul className="divide-y divide-border">
            {data.sources.map((s) => (
              <li
                key={`${s.source}|${s.medium}|${s.campaign}`}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {sourceLabel(s)}
                  </p>
                  {(s.medium || s.campaign) && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[s.medium, s.campaign].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {s.registrations}
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {Math.round((s.registrations / data.total) * 100)}%
                    {s.revenue > 0 && ` · ${inr(s.revenue)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No confirmed bookings yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
