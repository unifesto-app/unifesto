import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared building blocks for the dynamic Open Graph image routes (site
 * default, event, space, blog post, certificate).
 *
 * Look: the site's "monochrome cosmos" — black ground, one soft starlight
 * glow, silver wordmark, DM Sans headings over Hanken Grotesk body, hairline
 * borders and a silver CTA. Left column: wordmark, kind chip, title (≤2
 * lines), subtitle (≤2 lines), meta rows, CTA + domain. Right: the artwork in
 * a hairline frame (4:3 banner / 1:1 logo), or a monogram when there is none.
 */

/** Standard Open Graph / Twitter summary_large_image canvas. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Mirrors the dark tokens in globals.css. */
export const BRAND = {
  bg: "#000000",
  surface: "#0a0a0b",
  text: "#ececee",
  muted: "#a1a1a8",
  faint: "#6b6b72",
  hairline: "rgba(255,255,255,0.14)",
  silver: "linear-gradient(180deg, #ffffff 0%, #e4e4e8 50%, #b4b4bb 100%)",
  glow: "radial-gradient(circle at 80% 28%, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.035) 32%, rgba(0,0,0,0) 62%)",
} as const;

const PAD = 64;
const GAP = 56;

type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 600; style: "normal" };
let fontsCache: OgFont[] | null = null;

/**
 * DM Sans Medium (display) + Hanken Grotesk (body), the same faces the site
 * loads through next/font. Satori needs raw TTF buffers, so static TTFs live in
 * `public/fonts/og/` (shipped into the standalone runtime). On failure we
 * return [] and next/og falls back to its default font.
 */
export async function loadOgFonts(): Promise<OgFont[]> {
  if (fontsCache) return fontsCache;
  try {
    const dir = join(process.cwd(), "public", "fonts", "og");
    const [display, regular, semibold] = await Promise.all([
      readFile(join(dir, "DMSans-Medium.ttf")),
      readFile(join(dir, "HankenGrotesk-Regular.ttf")),
      readFile(join(dir, "HankenGrotesk-SemiBold.ttf")),
    ]);
    fontsCache = [
      { name: "DM Sans", data: display, weight: 500, style: "normal" },
      { name: "Hanken Grotesk", data: regular, weight: 400, style: "normal" },
      { name: "Hanken Grotesk", data: semibold, weight: 600, style: "normal" },
    ];
    return fontsCache;
  } catch {
    return [];
  }
}

/**
 * Fetch a remote image (an uploaded banner or logo) and return it as a base64
 * data URL, or null on any problem. Inlining the bytes means a slow or broken
 * asset degrades to the monogram instead of failing the render.
 */
export async function fetchImageAsDataUrl(
  url: string | null | undefined,
  timeoutMs = 4000,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    // Satori can't decode webp/avif/gif-anim reliably; skip rather than crash.
    if (!/^image\/(png|jpe?g|svg\+xml)/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 5_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read a file under `public/` as a data URL (Satori can't load relative URLs). */
export async function readPublicAsDataUrl(relPath: string): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public", relPath));
    const type = relPath.endsWith(".svg") ? "image/svg+xml" : "image/png";
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Everything every card needs: fonts + the silver wordmark. */
export async function loadOgBase() {
  const [fonts, wordmark] = await Promise.all([
    loadOgFonts(),
    readPublicAsDataUrl("press/wordmark-silver.svg"),
  ]);
  return { fonts, wordmark };
}

/** Plain text from Markdown-ish input, collapsed to one line. */
export function plain(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/** Hard character cap; Satori's line-clamp alone can't be trusted. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const clamp2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

/** Lines `text` takes when greedily word-wrapped at `perLine` characters. */
function wrappedLines(text: string, perLine: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) used = need;
    else {
      lines += Math.ceil(word.length / perLine);
      used = word.length % perLine || perLine;
    }
  }
  return lines;
}

/**
 * Pick the largest heading size that fits the title in two lines of `width`,
 * then cap the length so the smallest size still fits. DM Sans Medium runs
 * ~0.5em per lowercase glyph, wider for capitals, so 0.55; wrapping is
 * simulated per word.
 * ponytail: width estimate, not measured; swap for real text metrics if titles clip.
 */
function fitTitle(title: string, width: number): { text: string; size: number } {
  const perChar = 0.55;
  const sizes = [64, 56, 48, 40];
  for (const size of sizes) {
    if (wrappedLines(title, Math.floor(width / (size * perChar))) <= 2) return { text: title, size };
  }
  const min = sizes[sizes.length - 1];
  return { text: truncate(title, Math.floor(width / (min * perChar)) * 2 - 8), size: min };
}

export interface OgCardProps {
  /** Data URL of the silver wordmark SVG, null for a text fallback, false for none (white-label). */
  wordmark: string | null | false;
  /** Small chip above the title: "Event", "Space", "Blog"… */
  kind?: string;
  title: string;
  subtitle?: string | null;
  /** Short rows under the subtitle (date, venue, members…). */
  meta?: (string | null | undefined)[];
  /** Silver button label; omit for no button. */
  cta?: string;
  /** Data URL of the artwork. null → monogram; undefined → text-only card. */
  image?: string | null;
  imageAspect?: "4:3" | "1:1";
  /** cover crops to fill; contain letterboxes on the surface colour. */
  imageFit?: "cover" | "contain";
  /** Background behind the artwork (e.g. white for transparent logos). */
  imageBg?: string;
  /** Hairline frame around the artwork. Off for the bare brand symbol. */
  frame?: boolean;
  /** A glyph drawn in a 1:1 frame instead of an image (static pages). */
  icon?: ReactNode;
}

/**
 * The shared OG card, rendered by `ImageResponse`: every container has an
 * explicit `display` and all text sits in a flex element (Satori rules).
 */
export function OgCard({
  wordmark,
  kind,
  title,
  subtitle,
  meta = [],
  cta,
  image,
  imageAspect = "4:3",
  imageFit = "cover",
  imageBg = BRAND.surface,
  frame = true,
  icon,
}: OgCardProps): ReactNode {
  const hasArt = image !== undefined || icon !== undefined;
  const art = imageAspect === "1:1" || icon ? { w: 400, h: 400 } : { w: 452, h: 339 };
  const colWidth = OG_SIZE.width - PAD * 2 - (hasArt ? art.w + GAP : 0);
  const fitted = fitTitle(title, colWidth);
  const safeSubtitle = subtitle ? truncate(subtitle, hasArt ? 92 : 160) : null;
  const rows = meta.filter((x): x is string => Boolean(x));
  const radius = 18;

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: PAD,
        gap: GAP,
        background: BRAND.bg,
        position: "relative",
        fontFamily: "Hanken Grotesk",
        color: BRAND.text,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: BRAND.glow }} />

      {/* LEFT: wordmark, copy, CTA */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: colWidth,
          height: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {wordmark === false ? null : wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wordmark} alt="Unifesto" width={156} height={34} />
          ) : (
            <div style={{ display: "flex", fontFamily: "DM Sans", fontWeight: 500, fontSize: 30 }}>unifesto</div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {kind && (
            <div style={{ display: "flex", marginBottom: 22 }}>
              <div
                style={{
                  display: "flex",
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: `1px solid ${BRAND.hairline}`,
                  fontSize: 18,
                  color: BRAND.muted,
                }}
              >
                {kind}
              </div>
            </div>
          )}

          <div
            style={{
              ...clamp2,
              fontFamily: "DM Sans",
              fontWeight: 500,
              fontSize: fitted.size,
              lineHeight: 1.12,
              // Same rule as the site's .font-display: tighter as it grows.
              letterSpacing: Math.max(0.9 - 0.062 * fitted.size, -0.04 * fitted.size),
              color: BRAND.text,
            }}
          >
            {fitted.text}
          </div>

          {safeSubtitle && (
            <div style={{ ...clamp2, marginTop: 18, fontSize: 26, lineHeight: 1.38, color: BRAND.muted }}>
              {safeSubtitle}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: BRAND.silver }} />
                  <div
                    style={{
                      display: "flex",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: colWidth - 20,
                    }}
                  >
                    {row}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {cta && (
            <div
              style={{
                display: "flex",
                padding: "13px 28px",
                borderRadius: 10,
                background: BRAND.silver,
                color: "#000000",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {cta}
            </div>
          )}
          <div style={{ display: "flex", fontSize: 20, color: BRAND.faint }}>unifesto.app</div>
        </div>
      </div>

      {/* RIGHT: artwork */}
      {hasArt && (
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              width: art.w,
              height: art.h,
              borderRadius: radius,
              border: frame ? `1px solid ${BRAND.hairline}` : "none",
              background: frame ? (image ? imageBg : BRAND.surface) : "transparent",
              padding: image && imageFit === "contain" ? (frame ? 24 : 56) : 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {icon ? (
              icon
            ) : image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                width={art.w}
                height={art.h}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: imageFit,
                  // Satori doesn't clip <img> to the parent, so round it here
                  // (frame radius minus the 1px border).
                  borderRadius: imageFit === "cover" ? radius - 1 : 0,
                }}
              />
            ) : (
              <div style={{ display: "flex", fontFamily: "DM Sans", fontWeight: 500, fontSize: 150, color: BRAND.text }}>
                {(title.trim()[0] ?? "U").toUpperCase()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
