"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Check, Copy, DownloadSimple, EnvelopeSimple, Globe, InstagramLogo, LinkSimple, LinkedinLogo, WhatsappLogo } from "@unifesto/unicon/react";
import { Card } from "@/console/components/ui/card";
import { Button } from "@/console/components/ui/button";
import { Input } from "@/console/components/ui/input";
import { ListGroup, ListRow } from "@/console/components/shared/ListGroup";
import { DEFAULT_BUTTON, registerButtonHtml, type ButtonLook, type ButtonShape } from "@/console/lib/register-button";

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

/**
 * A link, a paste-in button and a QR for the organiser's own website. Tagged
 * with the site's name (medium "website", or "qr" for print) so its sign-ups
 * show as their own source, and carrying ?return= so the register page offers
 * "Back to <site>" once they're done.
 */
export function WebsiteLinks({ registerUrl, campaign }: { registerUrl: string; campaign: string }) {
  const { copied, copy } = useCopy();
  const [site, setSite] = useState("");
  const [page, setPage] = useState("");
  const [qr, setQr] = useState("");
  const [look, setLook] = useState<ButtonLook>(DEFAULT_BUTTON);
  const setLookField = <K extends keyof ButtonLook>(k: K, v: ButtonLook[K]) => setLook((l) => ({ ...l, [k]: v }));
  const s = tag(site);
  const back = /^https:\/\/[^\s]+\.[^\s]+$/i.test(page.trim()) ? page.trim() : "";
  const link = s
    ? withUtm(registerUrl, s, "website", tag(campaign) || undefined) + (back ? `&return=${encodeURIComponent(back)}` : "")
    : "";
  const qrLink = s ? withUtm(registerUrl, s, "qr", tag(campaign) || undefined) : "";
  const button = link ? registerButtonHtml(link, look) : "";

  useEffect(() => {
    let live = true;
    if (qrLink) QRCode.toDataURL(qrLink, { margin: 2, width: 512 }).then((d) => live && setQr(d), () => live && setQr(""));
    return () => {
      live = false;
    };
  }, [qrLink]);

  const row = (key: string, label: string, value: string) => (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{value}</code>
        <Button size="sm" variant="outline" onClick={() => void copy(value, key)}>
          {copied === key ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );

  return (
    <ListGroup
      title="On your website"
      description="A Register link, button and QR for your own site. Sign-ups through them show up as the site's own source."
    >
      <div className="space-y-4 p-4">
        <p className="flex items-center gap-2 text-sm text-foreground">
          <Globe className="h-5 w-5" weight="fill" /> Your site
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input placeholder="Site name, e.g. wegobeyond" value={site} onChange={(e) => setSite(e.target.value)} />
          <Input
            type="url"
            inputMode="url"
            placeholder="Page to come back to (optional), https://…"
            value={page}
            onChange={(e) => setPage(e.target.value)}
          />
        </div>
        {link && (
          <>
            {row("site-link", "Link", link)}
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Button style</p>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                <Input
                  aria-label="Button text"
                  maxLength={60}
                  value={look.label}
                  onChange={(e) => setLookField("label", e.target.value)}
                />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Colour
                  <input
                    type="color"
                    value={look.background}
                    onChange={(e) => setLookField("background", e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Text
                  <input
                    type="color"
                    value={look.color}
                    onChange={(e) => setLookField("color", e.target.value)}
                    className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                  />
                </label>
                <select
                  aria-label="Button shape"
                  value={look.shape}
                  onChange={(e) => setLookField("shape", e.target.value as ButtonShape)}
                  className="h-9 rounded-md border border-border bg-transparent px-2 text-sm text-foreground"
                >
                  <option value="pill">Pill</option>
                  <option value="rounded">Rounded</option>
                  <option value="square">Square</option>
                </select>
              </div>
              {/* The exact snippet, rendered: its label is escaped and colours are hex only. */}
              <div className="flex flex-wrap gap-3">
                <div className="rounded-md bg-white p-4" dangerouslySetInnerHTML={{ __html: registerButtonHtml("#", look) }} />
                <div className="rounded-md bg-neutral-900 p-4" dangerouslySetInnerHTML={{ __html: registerButtonHtml("#", look) }} />
              </div>
              {look !== DEFAULT_BUTTON && (
                <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setLook(DEFAULT_BUTTON)}>
                  Reset to Unifesto ink
                </button>
              )}
            </div>
            {row("site-button", "Button (paste into your page's HTML)", button)}
            <div className="flex items-center gap-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL from the qrcode encoder
                <img src={qr} alt="QR code for the Register link" className="h-24 w-24 rounded-md bg-white p-1" />
              )}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">QR for posters and print, tagged as {s} / qr.</p>
                {qr && (
                  <a href={qr} download={`${tag(campaign) || "event"}-${s}-qr.png`} className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline">
                    <DownloadSimple className="h-4 w-4" />
                    Download QR
                  </a>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ListGroup>
  );
}
