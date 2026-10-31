"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy, EnvelopeSimple, InstagramLogo, LinkSimple, LinkedinLogo, WhatsappLogo } from "@unifesto/unicon/react";
import { Card } from "@/console/components/ui/card";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";

export const fmt = (n: number) => n.toLocaleString("en-IN");

/** Copy to the clipboard and flash "Copied" on the key that did it. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback(async (text: string, key = text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1800);
    } catch {
      window.prompt("Copy this link", text);
    }
  }, []);
  return { copied, copy };
}

/** One bar per day scaled to the busiest day; empty days show a hairline. */
function DailyBars({ values, caption }: { values: number[]; caption?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="flex h-14 items-end gap-0.5" aria-label={caption}>
        {values.map((v, i) => (
          <div
            key={i}
            className={v > 0 ? "flex-1 rounded-sm bg-primary" : "flex-1 rounded-sm bg-border"}
            style={{ height: v > 0 ? `${Math.max(5, (v / max) * 100)}%` : 1 }}
          />
        ))}
      </div>
      {caption && <p className="mt-2 text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

/** Headline numbers and the daily bars, the top card of every tracking page. */
export function TrafficSummary({
  stats,
  daily,
  caption,
}: {
  stats: { label: string; value: string }[];
  daily: number[];
  caption: string;
}) {
  return (
    <Card className="p-5">
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className="truncate font-display text-2xl text-foreground">{s.value}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      <DailyBars values={daily} caption={caption} />
    </Card>
  );
}

const CHANNELS = [
  { source: "instagram", medium: "social", label: "Instagram", Icon: InstagramLogo },
  { source: "whatsapp", medium: "social", label: "WhatsApp", Icon: WhatsappLogo },
  { source: "linkedin", medium: "social", label: "LinkedIn", Icon: LinkedinLogo },
  { source: "email", medium: "email", label: "Email", Icon: EnvelopeSimple },
] as const;

/** Tags are stored lowercased server-side; normalise so the link reads like its row. */
const tag = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

function withUtm(url: string, source: string, medium?: string, campaign?: string): string {
  const q = new URLSearchParams({ utm_source: source });
  if (medium) q.set("utm_medium", medium);
  if (campaign) q.set("utm_campaign", campaign);
  return `${url}${url.includes("?") ? "&" : "?"}${q.toString()}`;
}

/** Per-channel tagged links plus a builder for anything else (a QR, a newsletter, an ad). */
export function TrackingLinks({ url, campaign }: { url: string; campaign: string }) {
  const { copied, copy } = useCopy();
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const s = tag(source);
  const built = s ? withUtm(url, s, tag(medium) || undefined, tag(campaign) || undefined) : "";
  const icon = (I: typeof LinkSimple): ReactNode => <I className="h-5 w-5" weight="fill" />;

  return (
    <ListGroup title="Tracking links" description="Registrations through a tagged link show up as its own source above.">
      {CHANNELS.map((c) => (
        <ListRow
          key={c.source}
          icon={icon(c.Icon)}
          label={`Copy ${c.label} link`}
          trailing={copied === c.source ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
          onClick={() => void copy(withUtm(url, c.source, c.medium, campaign), c.source)}
        />
      ))}
      <div className="space-y-4 p-4">
        <p className="flex items-center gap-2 text-sm text-foreground">
          {icon(LinkSimple)} Build a tracking link
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input placeholder="Source, e.g. college, poster" value={source} onChange={(e) => setSource(e.target.value)} />
          <Input placeholder="Medium (optional), e.g. qr, print" value={medium} onChange={(e) => setMedium(e.target.value)} />
        </div>
        {built && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{built}</code>
            <Button size="sm" variant="outline" onClick={() => void copy(built, "built")}>
              {copied === "built" ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
      </div>
    </ListGroup>
  );
}
