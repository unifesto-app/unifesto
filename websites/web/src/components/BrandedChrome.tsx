"use client";

import { useEffect, type CSSProperties } from "react";
import Link from "next/link";

/** White-label theme from the API (`space.branding` / `event.branding`). */
export interface Branding {
  /** Set only when the space theme is live; null = event colour override only. */
  name?: string | null;
  color: string | null;
  logoUrl?: string | null;
  /** `logoUrl` is the square space logo (no wide wordmark set). */
  logoSquare?: boolean;
  font?: string | null;
  mode?: "light" | "dark" | null;
  hidePoweredBy?: boolean;
  faviconUrl?: string | null;
  /** Verified custom web domain, the space's canonical home (e.g. `events.acme.edu`). */
  customDomain?: string | null;
}

/** True when the page should swap Unifesto's Navbar/Footer for the space's own. */
export const hasBrandedChrome = (b: Branding | null | undefined): b is Branding & { name: string } =>
  !!b?.name;

/**
 * CSS for the page wrapper: the accent recolours every `primary`/`accent`
 * utility, and the font replaces both the body and display faces.
 */
export function brandStyle(b: Branding | null | undefined): CSSProperties | undefined {
  if (!b) return undefined;
  const style: Record<string, string> = {};
  if (b.color) Object.assign(style, { "--primary": b.color, "--accent": b.color });
  if (b.font) {
    const family = `"${b.font}", system-ui, sans-serif`;
    Object.assign(style, { "--font-hanken": family, "--font-michroma": family, fontFamily: family });
  }
  return Object.keys(style).length ? (style as CSSProperties) : undefined;
}

/**
 * Loads the brand font and forces the brand's light/dark mode. The inline
 * script runs during parse so there's no flash; leaving the page hands the
 * theme back to the visitor's own choice (`__applyTheme` from layout.tsx).
 */
export function BrandTheme({ branding }: { branding: Branding | null | undefined }) {
  const mode = branding?.mode;
  useEffect(() => {
    if (!mode) return;
    document.documentElement.dataset.theme = mode;
    return () => (window as unknown as { __applyTheme?: () => void }).__applyTheme?.();
  }, [mode]);

  return (
    <>
      {branding?.font && (
        <link
          rel="stylesheet"
          precedence="default"
          href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.font)}:wght@400;500;600;700&display=swap`}
        />
      )}
      {mode && (
        <script
          dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(mode)}` }}
        />
      )}
    </>
  );
}

/** Fixed header in the Navbar's footprint, so page offsets don't change. */
export function BrandHeader({ branding, href }: { branding: Branding & { name: string }; href: string }) {
  return (
    <header className="blur-bg fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8 md:h-[4.5rem]">
        <Link href={href} className="flex min-w-0 items-center gap-3">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- organiser asset of unknown ratio
            <img
              src={branding.logoUrl}
              alt=""
              className={
                branding.logoSquare
                  ? "h-10 w-10 shrink-0 rounded-lg object-cover md:h-11 md:w-11"
                  : "h-8 w-auto max-w-[160px] object-contain md:h-9"
              }
            />
          )}
          <span className="truncate text-base font-semibold text-paper">{branding.name}</span>
        </Link>
      </div>
    </header>
  );
}

export function BrandFooter({ branding }: { branding: Branding & { name: string } }) {
  return (
    <footer className="mt-24 border-t border-border px-5 py-10 text-sm text-muted-foreground sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <span>
          © {new Date().getFullYear()} {branding.name}
        </span>
        <span className="flex flex-wrap items-center gap-4">
          {!branding.hidePoweredBy && (
            <a href="https://www.unifesto.app" className="hover:text-paper">
              Powered by Unifesto
            </a>
          )}
          <Link href="/privacy" className="hover:text-paper">Privacy</Link>
          <Link href="/terms" className="hover:text-paper">Terms</Link>
        </span>
      </div>
    </footer>
  );
}
