"use client";

import { useEffect, useRef, type ReactNode } from "react";

/* Liquid glass (vendored liquidglass, WebGL): direct children marked
   `data-glass` refract the root's other children behind them. Until the
   effect is running (and with no WebGL, or reduced transparency) the cards
   keep their solid fill; `lg-live` on the root hands the fill to the glass. */
export default function LiquidGlassRoot({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia("(prefers-reduced-transparency: reduce)").matches) return;
    let instance: { destroy(): void } | undefined;
    let cancelled = false;

    (async () => {
      await document.fonts.ready;
      // The glass photographs the scene once: wait for the entrances to settle
      // (looping animations never finish, so they are skipped), at most 2 s in
      // case a background tab has paused them.
      await Promise.race([
        Promise.all(
          root
            .getAnimations({ subtree: true })
            .filter((a) => a.effect?.getTiming().iterations !== Infinity)
            .map((a) => a.finished.catch(() => undefined)),
        ),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
      const { LiquidGlass } = await import("@/vendor/liquidglass");
      if (cancelled) return;
      instance = await LiquidGlass.init({
        root,
        glassElements: root.querySelectorAll<HTMLElement>(":scope > [data-glass]"),
        // Frosted glass: blur what's behind, no tint.
        defaults: { blurAmount: 0.35, cornerRadius: 12, zRadius: 24, edgeHighlight: 0.12 },
      });
      if (cancelled) instance.destroy();
      else root.classList.add("lg-live");
    })().catch(() => undefined); // no WebGL: the solid cards stay

    return () => {
      cancelled = true;
      root.classList.remove("lg-live");
      instance?.destroy();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {/* The glass can't see the root's own background: this ground is what it refracts. */}
      <div aria-hidden="true" className="lg-ground" />
      {children}
    </div>
  );
}
