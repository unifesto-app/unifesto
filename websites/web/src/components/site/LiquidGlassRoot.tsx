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
    let run = 0; // bumping it cancels any start still in flight

    const start = async (id: number) => {
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
      if (id !== run) return;
      const next = await LiquidGlass.init({
        root,
        glassElements: root.querySelectorAll<HTMLElement>(":scope > [data-glass]"),
        // Frosted glass: blur what's behind, no tint.
        defaults: { blurAmount: 0.35, cornerRadius: 12, zRadius: 24, edgeHighlight: 0.12 },
      });
      if (id !== run) return next.destroy();
      instance = next;
      root.classList.add("lg-live");
    };

    const restart = () => {
      run += 1;
      instance?.destroy();
      instance = undefined;
      root.classList.remove("lg-live");
      start(run).catch(() => undefined); // no WebGL: the solid cards stay
    };

    restart();
    // The photo is taken once, so a light/dark switch needs a new one.
    const themeWatch = new MutationObserver(restart);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      run += 1;
      themeWatch.disconnect();
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
