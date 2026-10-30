"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CaretDown,
  CaretRight,
  Check,
  Copy,
  EnvelopeSimple,
  InstagramLogo,
  LinkSimple,
  LinkedinLogo,
  WhatsappLogo,
} from "@unifesto/unicon/react";
import { Card } from "@/console/components/ui/card";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { EmptyState } from "@/console/components/shared/EmptyState";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { ErrorNotice } from "@/console/components/shared/ErrorNotice";
import {
  conversion,
  createShortLink,
  getShortLinkStats,
  getShortLinks,
  revokeShortLink,
  type ShortLink,
  type ShortLinkStats,
  type TrafficScope,
} from "@/console/lib/api/traffic";

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

/** What a short link points at, for its row. */
function shortLinkLabel(l: ShortLink): string {
  if (l.title) return l.title;
  if (l.event) return l.event.title;
  if (l.target === "SPACE") return l.space?.name ?? "Space page";
  return l.url.replace(/^https:\/\//, "").split("?")[0];
}

const DEVICE_LABEL: Record<string, string> = { ios: "iPhone / iPad", android: "Android", desktop: "Computer" };

const countryNames = new Intl.DisplayNames(["en-IN"], { type: "region" });
/** "IN" → "India"; null (Cloudflare didn't know) → "Unknown". */
const countryLabel = (code: string | null) => (code ? (countryNames.of(code) ?? code) : "Unknown");

function ShortLinkStatsView({ scope, linkId }: { scope: TrafficScope; linkId: string }) {
  const [data, setData] = useState<ShortLinkStats | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void getShortLinkStats(scope, linkId).then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, [scope, linkId]);
  if (error) return <p className="px-4 pb-4 text-sm text-destructive">{error}</p>;
  if (!data) return <p className="px-4 pb-4 text-sm text-muted-foreground">Loading stats…</p>;
  return (
    <div className="space-y-4 bg-muted/40 px-4 py-4">
      <TrafficSummary
        stats={[
          { label: "Clicks", value: fmt(data.clicks) },
          { label: "Visitors", value: fmt(data.visitors) },
          { label: "Registrations", value: fmt(data.registrations) },
          { label: "Registered per visitor", value: conversion(data.registrations, data.visitors) },
        ]}
        daily={data.daily.map((d) => d.clicks)}
        caption={`Clicks per day, last ${data.days} days`}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <ListGroup title="Where clicks came from" description="Direct or app: typed, scanned, or opened from an app like WhatsApp.">
          {data.referrers.length === 0 ? (
            <ListRow label="No clicks yet" />
          ) : (
            data.referrers.map((r) => <ListRow key={r.domain ?? "direct"} label={r.domain ?? "Direct or app"} value={fmt(r.clicks)} />)
          )}
        </ListGroup>
        {data.devices.length > 0 && (
          <ListGroup title="Devices">
            {data.devices.map((d) => (
              <ListRow key={d.device} label={DEVICE_LABEL[d.device] ?? d.device} value={fmt(d.clicks)} />
            ))}
          </ListGroup>
        )}
        {data.countries.length > 0 && (
          <ListGroup title="Countries">
            {data.countries.map((c) => (
              <ListRow key={c.country ?? "unknown"} label={countryLabel(c.country)} value={fmt(c.clicks)} />
            ))}
          </ListGroup>
        )}
        <ListGroup title="QR code" description="For posters, standees and slides. Scans count as clicks.">
          <div className="flex items-center gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API, not optimisable */}
            <img src={data.qrUrl} alt={`QR code for ${data.shortUrl}`} className="h-28 w-28 rounded-md bg-white p-1" />
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`${data.qrUrl}?format=png`}>Download PNG</a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={data.qrUrl} target="_blank" rel="noreferrer">
                  Open SVG
                </a>
              </Button>
            </div>
          </div>
        </ListGroup>
      </div>
    </div>
  );
}

/**
 * Tracked short links (unifesto.app/l/<code>) for an event or a space:
 * create, copy, expand for stats, turn off. Mirrors mobile's ShortLinksScreen.
 */
export function ShortLinksPanel({ scope, canEdit, destination }: { scope: TrafficScope; canEdit: boolean; destination: string }) {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  const load = useCallback(async () => {
    const res = await getShortLinks(scope);
    if (res.ok) {
      setLinks(res.data);
      setError("");
    } else setError(res.denied ? "You need access to see these links." : res.message);
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setSaving(true);
    setError("");
    const res = await createShortLink(scope, { title: title.trim() || undefined, source: source.trim() || undefined });
    setSaving(false);
    if (!res.ok) {
      setError(res.denied ? "You don't have permission to create links here." : res.message);
      return;
    }
    setTitle("");
    setSource("");
    setAdding(false);
    await load();
    void copy(res.data.shortUrl, res.data.id);
  };

  const turnOff = async (l: ShortLink) => {
    if (!window.confirm("Turn off this link? It stops redirecting and opens the Unifesto home page instead. Registrations it already brought in stay counted.")) return;
    const res = await revokeShortLink(scope, l.id);
    if (!res.ok) setError(res.message);
    await load();
  };

  return (
    <ListGroup
      title="Short links"
      description={`Short, trackable links to ${destination}. Each counts clicks and the registrations it brings in.`}
      action={
        canEdit && !adding ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            New link
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="p-3">
          <ErrorNotice message={error} />
        </div>
      )}
      {adding && (
        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Name, e.g. Campus posters" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Source tag, e.g. poster" value={source} onChange={(e) => setSource(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={add} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {links.length === 0 && !adding ? (
        <EmptyState
          icon={LinkSimple}
          title="No short links yet"
          description="Make a short link for each poster, post or channel to see which one brings people in."
          className="py-8"
        />
      ) : (
        links.map((l) => (
          <div key={l.id}>
            <div className="flex items-center gap-2 pr-3">
              <div className="min-w-0 flex-1">
                <ListRow
                  icon={open === l.id ? <CaretDown className="h-4 w-4" /> : <CaretRight className="h-4 w-4" />}
                  label={shortLinkLabel(l)}
                  sublabel={`${l.shortUrl.replace(/^https:\/\//, "")} · ${l.source}`}
                  value={`${fmt(l.clicks)} clicks · ${fmt(l.registrations)} reg.`}
                  onClick={() => setOpen(open === l.id ? null : l.id)}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={() => void copy(l.shortUrl, l.id)} aria-label="Copy link">
                {copied === l.id ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
              {canEdit && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void turnOff(l)}>
                  Turn off
                </Button>
              )}
            </div>
            {open === l.id && <ShortLinkStatsView scope={scope} linkId={l.id} />}
          </div>
        ))
      )}
    </ListGroup>
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
