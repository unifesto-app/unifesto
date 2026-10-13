"use client";

import { useSpaceId } from "@/lib/hooks/useSpaceId";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorNotice } from "@/components/shared/ErrorNotice";
import { DomainCard } from "@/components/white-label/DomainCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BRAND_FONTS,
  getWhiteLabelOverview,
  updateEventBranding,
  updateSpaceBranding,
  uploadBrandAsset,
  type BrandFontKey,
  type BrandingPatch,
  type EventWhiteLabelState,
  type SpaceWhiteLabelState,
  type WhiteLabelOverview,
} from "@/lib/api/white-label-api";

const DEFAULT_COLOR = "#7a5af8";
const HEX = /^#[0-9a-f]{6}$/i;
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "https://www.unifesto.app";

/** The editable slice of the space theme, as form state. */
type Draft = {
  enabled: boolean;
  brandColor: string;
  brandFont: BrandFontKey | "";
  brandMode: "light" | "dark" | "";
  hidePoweredBy: boolean;
  emailFromName: string;
  emailReplyTo: string;
};

const toDraft = (s: SpaceWhiteLabelState): Draft => ({
  enabled: s.whiteLabelEnabled,
  brandColor: s.brandColor ?? DEFAULT_COLOR,
  brandFont: s.brandFont ?? "",
  brandMode: s.brandMode ?? "",
  hidePoweredBy: s.hidePoweredBy,
  emailFromName: s.emailFromName ?? "",
  emailReplyTo: s.emailReplyTo ?? "",
});

/** Only what changed; blanks become `null` so the server clears them. */
function diff(from: Draft, to: Draft): BrandingPatch {
  const patch: BrandingPatch = {};
  if (from.enabled !== to.enabled) patch.enabled = to.enabled;
  if (from.brandColor !== to.brandColor) patch.brandColor = to.brandColor;
  if (from.brandFont !== to.brandFont) patch.brandFont = to.brandFont || null;
  if (from.brandMode !== to.brandMode) patch.brandMode = to.brandMode || null;
  if (from.hidePoweredBy !== to.hidePoweredBy) patch.hidePoweredBy = to.hidePoweredBy;
  if (from.emailFromName !== to.emailFromName) patch.emailFromName = to.emailFromName.trim() || null;
  if (from.emailReplyTo !== to.emailReplyTo) patch.emailReplyTo = to.emailReplyTo.trim() || null;
  return patch;
}

/**
 * Branding studio. Self-serve white-label: if the plan includes it, the space
 * edits its theme here and it goes live on save. Events wear the space theme
 * and can override only their accent colour.
 */
export default function BrandingStudioPage() {
  const spaceId = useSpaceId();
  const [data, setData] = useState<WhiteLabelOverview | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await getWhiteLabelOverview(spaceId);
    if (error) setError(error.message);
    else if (data) {
      setError("");
      setData(data);
      setDraft(toDraft(data.space));
    }
    setLoading(false);
  }, [spaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const patch = data && draft ? diff(toDraft(data.space), draft) : {};
  const dirty = Object.keys(patch).length > 0;
  const colorValid = !!draft && HEX.test(draft.brandColor);

  const save = async () => {
    setBusy(true);
    setError("");
    const { error } = await updateSpaceBranding(spaceId, patch);
    if (error) setError(error.message);
    else {
      setSaved(true);
      await load();
    }
    setBusy(false);
  };

  const upload = async (kind: "logo" | "favicon", file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError("");
    const { error } = await uploadBrandAsset(spaceId, kind, file);
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  const clearAsset = async (field: "brandLogoUrl" | "faviconUrl") => {
    setBusy(true);
    const { error } = await updateSpaceBranding(spaceId, { [field]: null });
    if (error) setError(error.message);
    else await load();
    setBusy(false);
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!data || !draft) return error ? <ErrorNotice message={error} /> : null;

  const { space } = data;
  const status = space.brandingSuspendedAt
    ? { label: "Suspended", variant: "destructive" as const }
    : data.live
      ? { label: "Live", variant: "success" as const }
      : { label: "Off", variant: "neutral" as const };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="White-label"
        title="Branding"
        subtitle="Make your public pages and attendee emails look like yours, not ours."
      />

      {error && <ErrorNotice message={error} />}

      {!data.planHasBranding ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branding isn&rsquo;t in your plan</CardTitle>
            <CardDescription>
              Upgrade to use your own logo, colour, font and email sender, and to remove
              &ldquo;Powered by Unifesto&rdquo;.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard/billing">See plans</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {space.brandingSuspendedAt && (
            <ErrorNotice message="Unifesto has paused branding on this space, so attendees see the default look. Your settings are kept. Contact support to restore it." />
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Theme <Badge variant={status.variant}>{status.label}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Applies to your space page and every event page under it.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <label className="flex items-center gap-3 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => set("enabled", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Use my branding on public pages
                  </label>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="brand-color">Accent colour</Label>
                      <div className="flex items-center gap-2">
                        <input
                          id="brand-color"
                          type="color"
                          value={colorValid ? draft.brandColor : DEFAULT_COLOR}
                          onChange={(e) => set("brandColor", e.target.value)}
                          className="h-10 w-12 cursor-pointer rounded border border-border bg-transparent p-1"
                        />
                        <Input
                          value={draft.brandColor}
                          onChange={(e) => set("brandColor", e.target.value.trim())}
                          className="font-mono"
                          aria-invalid={!colorValid}
                          aria-label="Accent colour hex"
                        />
                      </div>
                      {!colorValid && (
                        <p className="text-xs text-destructive">Use a 6-digit hex colour, like #7a5af8.</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="brand-font">Font</Label>
                      <select
                        id="brand-font"
                        value={draft.brandFont}
                        onChange={(e) => set("brandFont", e.target.value as BrandFontKey | "")}
                        className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                      >
                        <option value="">Unifesto default</option>
                        {Object.entries(BRAND_FONTS).map(([key, family]) => (
                          <option key={key} value={key}>
                            {family}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <fieldset className="space-y-1.5">
                    <legend className="text-sm font-medium text-foreground">Page theme</legend>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["", "Visitor's choice"],
                        ["light", "Always light"],
                        ["dark", "Always dark"],
                      ] as const).map(([value, label]) => (
                        <Button
                          key={value}
                          type="button"
                          size="sm"
                          variant={draft.brandMode === value ? "default" : "outline"}
                          onClick={() => set("brandMode", value)}
                          aria-pressed={draft.brandMode === value}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </fieldset>

                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={draft.hidePoweredBy}
                      onChange={(e) => set("hidePoweredBy", e.target.checked)}
                      className="h-4 w-4 accent-primary"
                    />
                    Hide &ldquo;Powered by Unifesto&rdquo;
                  </label>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Logo and icon</CardTitle>
                  <CardDescription>
                    A wide logo for the page header (falls back to your square space logo) and the
                    browser tab icon. PNG, JPG, WebP or ICO, up to 1 MB.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <AssetField
                    label="Header logo"
                    url={space.brandLogoUrl}
                    busy={busy}
                    onFile={(f) => upload("logo", f)}
                    onClear={() => clearAsset("brandLogoUrl")}
                  />
                  <AssetField
                    label="Favicon"
                    url={space.faviconUrl}
                    busy={busy}
                    onFile={(f) => upload("favicon", f)}
                    onClear={() => clearAsset("faviconUrl")}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Attendee emails</CardTitle>
                  <CardDescription>How your confirmation emails are signed.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-from">Sender name</Label>
                    <Input
                      id="brand-from"
                      value={draft.emailFromName}
                      onChange={(e) => set("emailFromName", e.target.value)}
                      placeholder={space.name}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="brand-reply">Reply-to email</Label>
                    <Input
                      id="brand-reply"
                      type="email"
                      value={draft.emailReplyTo}
                      onChange={(e) => set("emailReplyTo", e.target.value)}
                      placeholder="hello@yourorg.com"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={busy || !dirty || !colorValid}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
                {saved && !dirty && <span className="text-sm text-muted-foreground">Saved.</span>}
                <a
                  href={`${WEB_URL}/space/${space.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto text-sm text-muted-foreground underline hover:text-foreground"
                >
                  View public page
                </a>
              </div>
            </div>

            <BrandPreview space={space} draft={draft} />
          </div>

          <EventOverrides events={data.events} spaceColor={data.live ? space.brandColor : null} onChanged={load} />

          <DomainCard spaceId={spaceId} kind="web" />
          <DomainCard spaceId={spaceId} kind="email" />
        </>
      )}
    </div>
  );
}

function AssetField({
  label,
  url,
  busy,
  onFile,
  onClear,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- organiser upload of unknown ratio
          <img src={url} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">None yet</span>
        )}
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline" disabled={busy}>
          <label className="cursor-pointer">
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/x-icon"
              className="sr-only"
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        {url && (
          <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

/** A small mock of the public page, driven by the unsaved draft. */
function BrandPreview({ space, draft }: { space: SpaceWhiteLabelState; draft: Draft }) {
  const font = draft.brandFont ? BRAND_FONTS[draft.brandFont] : null;
  const dark = draft.brandMode !== "light";
  const accent = HEX.test(draft.brandColor) ? draft.brandColor : DEFAULT_COLOR;
  const logo = space.brandLogoUrl ?? space.logoUrl;
  const style: CSSProperties = {
    fontFamily: font ? `"${font}", system-ui, sans-serif` : undefined,
    background: dark ? "#0a0a0b" : "#ffffff",
    color: dark ? "#ececee" : "#111113",
  };

  return (
    <div className="space-y-2 lg:sticky lg:top-6">
      {font && (
        <link
          rel="stylesheet"
          precedence="default"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600&display=swap`}
        />
      )}
      <p className="text-xs font-medium text-muted-foreground">
        Preview{draft.brandMode ? "" : " (dark shown; visitors can switch)"}
      </p>
      <div className="overflow-hidden rounded-xl border border-border shadow-sm" style={style}>
        <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: dark ? "#ffffff1a" : "#0000001a" }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element -- preview of the organiser's upload
            <img src={logo} alt="" className="h-6 w-auto max-w-[96px] object-contain" />
          )}
          <span className="truncate text-sm font-semibold">{space.name}</span>
        </div>
        <div className="space-y-3 p-4">
          <div
            className="aspect-[4/3] w-full rounded-lg"
            style={{ background: `radial-gradient(120% 120% at 20% -10%, ${accent}55, transparent 60%), ${dark ? "#141416" : "#f4f4f5"}` }}
          />
          <p className="text-lg font-semibold leading-tight">Your next event</p>
          <p className="text-xs opacity-70">Sat, 18 Oct · Hyderabad</p>
          <span
            className="inline-block rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: accent, color: "#fff" }}
          >
            Register
          </span>
        </div>
        <div className="flex justify-between border-t px-4 py-2 text-[11px] opacity-60" style={{ borderColor: dark ? "#ffffff1a" : "#0000001a" }}>
          <span>© {space.name}</span>
          {!draft.hidePoweredBy && <span>Powered by Unifesto</span>}
        </div>
      </div>
      {!draft.enabled && (
        <p className="text-xs text-muted-foreground">Turn branding on for attendees to see this.</p>
      )}
    </div>
  );
}

function EventOverrides({
  events,
  spaceColor,
  onChanged,
}: {
  events: EventWhiteLabelState[];
  spaceColor: string | null;
  onChanged: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Event colours</CardTitle>
        <CardDescription>
          Events use your space theme. Give one its own accent only when it needs a different look.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">This space has no events yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {events.map((e) => (
              // Keyed on the saved colours so a reload re-seeds the row's picker.
              <EventColorRow key={`${e.id}:${e.whiteLabelEnabled}:${e.brandColor}:${spaceColor}`} event={e} spaceColor={spaceColor} onChanged={onChanged} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventColorRow({
  event,
  spaceColor,
  onChanged,
}: {
  event: EventWhiteLabelState;
  spaceColor: string | null;
  onChanged: () => Promise<void>;
}) {
  const own = event.whiteLabelEnabled ? event.brandColor : null;
  const [color, setColor] = useState(own ?? spaceColor ?? DEFAULT_COLOR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const apply = async (brandColor: string | null) => {
    setBusy(true);
    setError("");
    const { error } = await updateEventBranding(event.id, { brandColor });
    if (error) setError(error.message);
    else await onChanged();
    setBusy(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{event.title}</span>
      {own ? <Badge variant="success">Own colour</Badge> : spaceColor ? <Badge variant="neutral">Space colour</Badge> : null}
      <input
        type="color"
        value={HEX.test(color) ? color : DEFAULT_COLOR}
        onChange={(e) => setColor(e.target.value)}
        aria-label={`Accent colour for ${event.title}`}
        className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
      />
      <Button size="sm" variant="outline" disabled={busy || color === own} onClick={() => apply(color)}>
        Set
      </Button>
      {own && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => apply(null)}>
          Use space colour
        </Button>
      )}
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </div>
  );
}
