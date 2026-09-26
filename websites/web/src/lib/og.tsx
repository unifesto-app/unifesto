import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CSSProperties, ReactNode } from "react";

/**
 * Shared building blocks for the dynamic Open Graph image routes
 * (`event/[slug]/opengraph-image.tsx`, `space/[spaceSlug]/opengraph-image.tsx`).
 *
 * Layout (both event and space): Unifesto wordmark top-left, the entity's
 * details on the left (title on one line, host/description on two, small meta,
 * and a CTA capsule at the bottom), and the artwork as a bordered card on the
 * right — 4:3 for banners, 1:1 for a space logo.
 */

/** Standard Open Graph / Twitter summary_large_image canvas. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

/** Brand palette (mirrors globals.css / lib/styles). */
export const BRAND = {
  bg: "#050507",
  primary: "#3491ff",
  primaryBright: "#0062ff",
  text: "#ffffff",
  muted: "#9aa4b2",
  gradient: "linear-gradient(135deg, #3491ff, #0062ff)",
  // Card backdrop: brand blue dissolving from the bottom-right corner into black.
  bgWash: "linear-gradient(315deg, #123f73 0%, #0a2a5a 18%, #071630 33%, #050507 58%)",
  // Soft heat glow rising from the bottom edge (same brand blue), fading up.
  bottomHeat:
    "linear-gradient(0deg, rgba(52,145,255,0.30) 0%, rgba(52,145,255,0.09) 30%, rgba(52,145,255,0) 60%)",
} as const;

type OgFont = { name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" };
let fontsCache: OgFont[] | null = null;

/**
 * Load the Product Sans weights used by the cards. The TTFs are copied into
 * `public/fonts/` (which the Dockerfile ships into the standalone runtime), so
 * they resolve at `process.cwd()/public/...`. On any failure we return [] and
 * next/og falls back to its default font rather than erroring the image.
 */
export async function loadOgFonts(): Promise<OgFont[]> {
  if (fontsCache) return fontsCache;
  try {
    const dir = join(process.cwd(), "public", "fonts", "product-sans");
    const [regular, medium, bold] = await Promise.all([
      readFile(join(dir, "ProductSans-Regular.ttf")),
      readFile(join(dir, "ProductSans-Medium.ttf")),
      readFile(join(dir, "ProductSans-Bold.ttf")),
    ]);
    fontsCache = [
      { name: "Product Sans", data: regular, weight: 400, style: "normal" },
      { name: "Product Sans", data: medium, weight: 500, style: "normal" },
      { name: "Product Sans", data: bold, weight: 700, style: "normal" },
    ];
    return fontsCache;
  } catch {
    return [];
  }
}

/**
 * Fetch a remote image (e.g. an uploaded banner or logo) and return it as a
 * base64 data URL, or null on any problem. We inline the bytes rather than
 * handing Satori a URL so the render never depends on Satori's own network
 * fetch — a slow or broken asset degrades gracefully to the monogram.
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
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 5_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a PNG bundled under the app's `public/` dir (copied into the standalone
 * runtime by the Dockerfile) and return it as a data URL. Used for the local
 * Unifesto wordmark, which Satori cannot load by relative URL.
 */
export async function readPublicPngAsDataUrl(relPath: string): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public", relPath));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Two-line clamp (Satori supports the WebKit line-clamp trio). */
const clamp2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

/**
 * Hard character cap with an ellipsis. Satori's line-clamp is unreliable, so we
 * bound the text in code too — this is the real guarantee against overflow.
 */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Fallback wordmark drawn with primitives if the PNG can't be read. */
function TextWordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 24, height: 24, borderRadius: 7, background: BRAND.primary }} />
      <div style={{ fontSize: 38, fontWeight: 700, color: BRAND.text, letterSpacing: -1 }}>
        unifesto
      </div>
    </div>
  );
}

export interface OgCardProps {
  /** Data URL of the Unifesto wordmark PNG, or null to fall back to text. */
  wordmark: string | null;
  /** Primary heading — event title or space name. Rendered on one line. */
  title: string;
  /** Secondary line — "Hosted by …" (event) or description (space). 2 lines. */
  subtitle?: string | null;
  /** Small meta rows under the subtitle (date, location, members…). */
  meta: string[];
  /** CTA capsule label, bottom-left (e.g. "Register Now" / "RSVP Now"). */
  cta: string;
  /** Data URL for the card image, or null for the monogram placeholder. */
  image: string | null;
  /** Card aspect ratio — 4:3 for banners, 1:1 for logos. */
  imageAspect?: "4:3" | "1:1";
  /** How the image sits in the card — cover for banners, contain for logos. */
  imageFit?: "cover" | "contain";
  /** Card background behind the image (dark for banners, light for logos). */
  imageBg?: string;
  /** Single letter used in the placeholder when there is no image. */
  monogram: string;
}

/**
 * The shared OG card. Rendered by `ImageResponse`, so every container carries
 * an explicit `display` and all text sits inside a flex element (Satori rules).
 */
export function OgCard({
  wordmark,
  title,
  subtitle,
  meta,
  cta,
  image,
  imageAspect = "4:3",
  imageFit = "cover",
  imageBg = BRAND.bg,
  monogram,
}: OgCardProps): ReactNode {
  const safeTitle = truncate(title, 44);
  const safeSubtitle = subtitle ? truncate(subtitle, 120) : null;
  const titleSize = safeTitle.length <= 18 ? 58 : safeTitle.length <= 30 ? 46 : 38;
  const dims = imageAspect === "1:1" ? { w: 392, h: 392 } : { w: 452, h: 339 };
  const rows = meta.filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: 64,
        gap: 52,
        background: BRAND.bgWash,
        position: "relative",
        fontFamily: "Product Sans",
      }}
    >
      {/* Heat glow rising from the bottom, same brand blue */}
      <div style={{ position: "absolute", inset: 0, background: BRAND.bottomHeat }} />

      {/* LEFT — wordmark, details, CTA */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flex: 1,
          height: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wordmark} alt="Unifesto" height={44} style={{ height: 44 }} />
          ) : (
            <TextWordmark />
          )}
        </div>

        {/* Title (1 line) + subtitle (2 lines) + small meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              fontSize: titleSize,
              fontWeight: 700,
              color: BRAND.text,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 560,
            }}
          >
            {safeTitle}
          </div>

          {safeSubtitle && (
            <div style={{ ...clamp2, fontSize: 24, color: BRAND.muted, lineHeight: 1.35, maxWidth: 560 }}>
              {safeSubtitle}
            </div>
          )}

          {rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
              {rows.map((item, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 19, color: BRAND.muted }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: 999, background: BRAND.primary }} />
                  <div
                    style={{
                      display: "flex",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 520,
                    }}
                  >
                    {item}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA capsule, bottom-left */}
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 30px",
              borderRadius: 999,
              background: BRAND.gradient,
              fontSize: 24,
              fontWeight: 700,
              color: BRAND.text,
            }}
          >
            {cta}
          </div>
        </div>
      </div>

      {/* RIGHT — bordered image card (4:3 banner or 1:1 logo) */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            width: dims.w,
            height: dims.h,
            borderRadius: 28,
            overflow: "hidden",
            border: "2px solid rgba(255,255,255,0.16)",
            background: image ? imageBg : BRAND.gradient,
            padding: image && imageFit === "contain" ? 28 : 0,
          }}
        >
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: imageFit,
                // Satori doesn't clip <img> to a parent's overflow:hidden, so the
                // image must round its own corners (card radius 28 − 2px border).
                borderRadius: imageFit === "cover" ? 26 : 0,
              }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 150,
                fontWeight: 700,
                color: BRAND.text,
              }}
            >
              {monogram}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
