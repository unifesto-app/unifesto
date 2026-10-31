import type { ReactNode } from "react";
import { HeroSky } from "@/components/site/CosmicBackdrop";
import LiquidGlassRoot from "@/components/site/LiquidGlassRoot";

/* The opener for every inner page, on the home hero's sky: stars that follow
   the pointer, the blue glow rising from the bottom-right corner and the
   horizon on the bottom edge. The heading is written as explicit
   lines; each rises through a waterline (masked, staggered) once, on load.
   It renders fully visible without JS. No eyebrow: the heading speaks.
   `accent` lines drop to a dimmer starlight for the one phrase that carries the page.
   `card` is a panel in frosted glass, as on the home hero: floated over the
   `aside` phone (wide screens), or on its own over the glow. */
export default function PageHero({
  lines,
  accentFrom,
  lede,
  actions,
  aside,
  card,
  surface = "night",
  size = "lg",
}: {
  lines: string[];
  /** Index of the first line rendered in the accent colour. */
  accentFrom?: number;
  lede?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  card?: ReactNode;
  surface?: "night" | "paper";
  size?: "lg" | "md";
}) {
  const light = surface === "paper";
  const scale =
    size === "lg" ? "text-[clamp(1.75rem,4.6vw,3.75rem)]" : "text-[clamp(1.5rem,3.4vw,2.75rem)]";
  const visual = aside || card;
  return (
    <section
      id="page-hero"
      data-surface={light ? "light" : undefined}
      className={`surface-${surface} relative overflow-hidden`}
    >
      {/* With a card, the glow lives in the card's glass root so the frost has colour. */}
      <HeroSky targetId="page-hero" glow={!card} />
      <div
        className={`relative mx-auto grid w-full max-w-7xl gap-12 px-5 pb-16 pt-32 sm:px-8 md:pb-24 md:pt-40 ${
          visual ? "lg:grid-cols-[1.15fr_0.85fr] lg:items-end" : ""
        }`}
      >
        <div className="max-w-4xl">
          <h1
            className={`waterline-load font-display leading-[1.12] ${scale} ${light ? "text-ink" : "text-paper"}`}
            style={{ letterSpacing: "-0.035em" }}
          >
            {lines.map((line, i) => (
              <span key={i} className="line" style={{ ["--l" as string]: i }}>
                <span
                  className={`line-inner ${
                    accentFrom !== undefined && i >= accentFrom ? "text-paper/60" : ""
                  }`}
                >
                  {line}
                </span>
              </span>
            ))}
          </h1>
          {lede && (
            <div
              className={`enter mt-7 max-w-[60ch] text-base leading-relaxed md:text-lg ${light ? "text-ink/70" : "text-paper/65"}`}
            >
              {lede}
            </div>
          )}
          {actions && (
            <div className="enter mt-9 flex flex-col gap-4 sm:flex-row sm:items-center" style={{ ["--d" as string]: `${lines.length * 90 + 320}ms` }}>
              {actions}
            </div>
          )}
        </div>
        {card ? (
          <LiquidGlassRoot className="relative">
            <div aria-hidden="true" className="hero-glow" />
            {aside && (
              <div className="enter" style={{ ["--d" as string]: "250ms" }}>
                {aside}
              </div>
            )}
            <div
              data-glass
              className={`hero-card enter z-10 ${aside ? "absolute bottom-[10%] left-0 hidden w-[18rem] lg:block" : "relative mx-auto w-full max-w-sm"}`}
              style={{ ["--d" as string]: aside ? "420ms" : "250ms" }}
            >
              {card}
            </div>
          </LiquidGlassRoot>
        ) : (
          aside && (
            <div className="enter" style={{ ["--d" as string]: "250ms" }}>
              {aside}
            </div>
          )
        )}
      </div>
    </section>
  );
}
