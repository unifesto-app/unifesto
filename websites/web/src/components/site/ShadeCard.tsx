import type { ReactNode } from "react";
import LiquidGlassRoot from "@/components/site/LiquidGlassRoot";

/* "door" is sky blending into mint: the container the two sides merge into. */
export type Shade = "sky" | "mint" | "ivory" | "blue" | "door";

/* Lists of cards (plans, posts, roles) cycle these by position. */
export const SHADES = ["sky", "mint", "ivory", "blue"] as const satisfies readonly Shade[];

/* A card painted in one accent's shade (soft blended shapes: orbs, a horizon,
   a beam or a fan) under heavy overlay grain, with a product picture floating
   on it. With `glass`, the
   picture is a panel that turns to frosted glass and bends the shade behind
   it; without, it's anything (a phone) sitting on the shade. The glass wraps
   the panel's own width by default (Panel is max-w-sm, centred, so the gaps
   match on both sides); content cards pass `glassClassName` to fill the card.
   Tones and grain live in globals.css under "Shade cards". */
export default function ShadeCard({
  shade,
  glass = false,
  className = "",
  glassClassName = "mx-auto w-full max-w-sm",
  children,
}: {
  shade: Shade;
  glass?: boolean;
  className?: string;
  glassClassName?: string;
  children?: ReactNode;
}) {
  const classes = `shade-card shade-${shade} ${className}`;
  const fill = (
    <div aria-hidden="true" className="shade-fill">
      <div className="shade-shapes" />
    </div>
  );
  if (!glass) {
    return (
      <div className={classes}>
        {fill}
        {children}
      </div>
    );
  }
  return (
    <LiquidGlassRoot className={classes}>
      {fill}
      <div data-glass className={`relative z-10 ${glassClassName}`}>
        {children}
      </div>
    </LiquidGlassRoot>
  );
}

/* A product picture on its shade, the way the home page shows them: a panel
   turns to frosted glass, a phone (or anything that moves, like the flipping
   ID card) stands on the shade as it is. */
export function ShadeFrame({ shade, phone = false, children }: { shade: Shade; phone?: boolean; children: ReactNode }) {
  return phone ? (
    <ShadeCard shade={shade} className="flex w-full max-w-[30rem] justify-center px-6 py-10">
      {children}
    </ShadeCard>
  ) : (
    <ShadeCard shade={shade} glass className="w-full max-w-[30rem] p-8 sm:p-10">
      {children}
    </ShadeCard>
  );
}
