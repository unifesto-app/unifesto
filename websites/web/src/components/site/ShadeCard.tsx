import type { ReactNode } from "react";
import LiquidGlassRoot from "@/components/site/LiquidGlassRoot";

export type Shade = "sky" | "mint" | "ivory" | "blue";

/* A card painted in one accent's shade (glowing along the hero's two orbit
   lines) under heavy overlay grain, with a product picture floating on it. With `glass`, the
   picture is a panel that turns to frosted glass and bends the shade behind
   it; without, it's anything (a phone) sitting on the shade. Tones and
   grain live in globals.css under "Shade cards". */
export default function ShadeCard({
  shade,
  glass = false,
  className = "",
  children,
}: {
  shade: Shade;
  glass?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = `shade-card shade-${shade} ${className}`;
  const layers = (
    <div aria-hidden="true" className="shade-fill">
      <div className="shade-orbits" />
    </div>
  );
  if (!glass) {
    return (
      <div className={classes}>
        {layers}
        {children}
      </div>
    );
  }
  return (
    <LiquidGlassRoot className={classes}>
      {layers}
      {/* The panels' own width (Panel is max-w-sm), centred, so the glass
          covers exactly the panel and the gaps match on both sides. */}
      <div data-glass className="relative z-10 mx-auto w-full max-w-sm">
        {children}
      </div>
    </LiquidGlassRoot>
  );
}
