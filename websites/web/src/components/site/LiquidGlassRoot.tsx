"use client";

import { useEffect, useRef, type ReactNode } from "react";

/* Liquid glass (vendored liquidglass, WebGL): direct children marked
   `data-glass` refract the root's other children behind them. Until the
   effect is running (and with no WebGL, reduced transparency, or a touch
   screen) the cards keep their solid fill; `lg-live` on the root hands the
   fill to the glass. Touch screens skip it: each card is a WebGL context
   drawing every frame plus a main-thread photo of the page, which on a phone
   holds up first taps and scrolling.
   The glass can't see the root's own background or anything outside the
   root: what it refracts starts from the section's ground colour
   (--stage-ground), with the root's children drawn on top. */
export default function LiquidGlassRoot({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia("(prefers-reduced-transparency: reduce), (pointer: coarse)").matches) return;
    let instance: { destroy(): void } | undefined;
    let run = 0; // bumping it cancels any start still in flight
    let started = false;

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
      // Hidden glass (the hero card on phones) gets no canvas; none shown, no WebGL.
      const glass = [...root.querySelectorAll<HTMLElement>(":scope > [data-glass]")].filter((el) => el.getClientRects().length);
      if (!glass.length) return;
      // Each glass takes the corner of the panel it covers (8px cards, the
      // 16px footer card), so the frost never pokes past the panel's edge.
      for (const el of glass) {
        const panel = el.querySelector<HTMLElement>(":scope > :not(canvas)");
        if (panel) el.dataset.config = JSON.stringify({ cornerRadius: parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0 });
      }
      const next = await LiquidGlass.init({
        root,
        glassElements: glass,
        // Frosted glass: blur what's behind, no tint.
        defaults: { blurAmount: 0.35, cornerRadius: 8, zRadius: 24, edgeHighlight: 0.12 },
        backdrop: getComputedStyle(root).getPropertyValue("--stage-ground").trim() || "#000",
      });
      if (id !== run) return next.destroy();
      instance = next;
      root.classList.add("lg-live");
    };

    const stop = () => {
      run += 1;
      instance?.destroy(); // frees its WebGL context
      instance = undefined;
      root.classList.remove("lg-live");
    };

    const restart = () => {
      stop();
      start(run).catch(() => undefined); // no WebGL: the solid cards stay
    };

    // Run only while the card is within three quarters of a screen of the
    // view: glass further down costs nothing at load (a hidden root, display:
    // none, never starts), a page of glass cards never holds more WebGL
    // contexts than the browser keeps alive (16 in Chrome), and the head start
    // covers the ~1 s the photo takes, so scrolling back never shows the swap.
    // Out of range the card falls back to its solid fill.
    const near = new IntersectionObserver(
      ([entry]) => {
        started = entry.isIntersecting;
        if (started) restart();
        else stop();
      },
      { rootMargin: "75% 0px" },
    );
    near.observe(root);

    // The photo is taken once, so a light/dark switch needs a new one.
    const themeWatch = new MutationObserver(() => {
      if (started) restart();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      near.disconnect();
      themeWatch.disconnect();
      stop();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
