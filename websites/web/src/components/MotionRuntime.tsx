"use client";

import { useEffect } from "react";

/* Scroll reveals for the whole site, mounted once in the layout.

   Runs entirely on the Web Animations API: it never writes an attribute,
   class or inline style, so it cannot cause a hydration mismatch, even
   when it reaches a Suspense boundary React has not hydrated yet.

   Content is visible by default. Only elements that start below the fold
   are held hidden (a paused animation, not a style), then released as they
   scroll in. No JS, headless render or failed script: everything shows.
   Children of [data-stagger] reveal with a capped sibling stagger;
   .waterline headings rise line by line. Reduced motion: no reveals. */

const EXPO = "cubic-bezier(.19, 1, .22, 1)";
const STAGGER_CAP = 8;

type Kf = Keyframe;
const FROM: Record<string, Kf> = {
  rise: { opacity: 0, transform: "translateY(28px)" },
  blur: { opacity: 0, transform: "translateY(12px)", filter: "blur(10px)" },
  scale: { opacity: 0, transform: "translateY(20px) scale(0.96)" },
  // Overhanging mask: Michroma's descenders sit outside the line box.
  clip: { opacity: 1, clipPath: "inset(-0.2em -0.1em 100% -0.1em)", transform: "translateY(16px)" },
  grow: { transform: "scaleY(0)" },
  fill: { transform: "scaleX(0)" },
};
const LINE_FROM: Kf = { transform: "translateY(105%)", opacity: 0 };

type Target = { el: HTMLElement; from: Kf; delay: number; duration: number; easing: string };

export default function MotionRuntime() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const held = new Map<Element, Target[]>();
    const seen = new WeakSet<Element>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const targets = held.get(e.target);
          io.unobserve(e.target);
          if (!targets) continue;
          held.delete(e.target);
          targets.forEach((t) => {
            // A one-keyframe animation runs from `from` to the element's own
            // computed value, so inline transforms (bar widths) are kept.
            t.el.animate([{ ...t.from, offset: 0 }], {
              duration: t.duration,
              delay: t.delay,
              easing: t.easing,
              fill: "backwards",
            });
          });
          targets.forEach((t) => t.el.getAnimations().forEach((a) => a.id === "hold" && a.cancel()));
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0 },
    );

    const holdHidden = (trigger: HTMLElement, targets: Target[]) => {
      if (!targets.length) return;
      // Paused at t=0 with fill: the element shows `from` until released.
      for (const t of targets) t.el.animate([t.from, t.from], { duration: 1, fill: "forwards", id: "hold" }).pause();
      held.set(trigger, targets);
      io.observe(trigger);
    };

    const belowFold = (el: Element) => el.getBoundingClientRect().top >= window.innerHeight * 0.92;

    const revealType = (el: HTMLElement) =>
      el.dataset.reveal || el.parentElement?.dataset.stagger || "rise";

    const prepare = (root: ParentNode) => {
      const nodes = new Set<HTMLElement>();
      root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((n) => nodes.add(n));
      root.querySelectorAll<HTMLElement>("[data-stagger]").forEach((g) =>
        Array.from(g.children).forEach((c) => nodes.add(c as HTMLElement)),
      );

      nodes.forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (!belowFold(el)) return;
        const type = revealType(el);
        const parent = el.parentElement;
        const i = parent?.hasAttribute("data-stagger") ? Math.min(Array.from(parent.children).indexOf(el), STAGGER_CAP) : 0;
        const fill = type === "fill";
        holdHidden(el, [
          {
            el,
            from: FROM[type] ?? FROM.rise,
            delay: fill ? 300 : i * 70,
            duration: fill ? 1200 : type === "clip" ? 900 : 700,
            easing: fill ? "linear" : EXPO,
          },
        ]);
      });

      root.querySelectorAll<HTMLElement>(".waterline").forEach((w) => {
        if (seen.has(w)) return;
        seen.add(w);
        if (!belowFold(w)) return;
        const lines = Array.from(w.querySelectorAll<HTMLElement>(".line-inner"));
        holdHidden(
          w,
          lines.map((el, l) => ({ el, from: LINE_FROM, delay: l * 90 + 60, duration: 900, easing: EXPO })),
        );
      });
    };

    prepare(document);
    const mo = new MutationObserver((records) => {
      for (const r of records)
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLElement) prepare(n.parentElement ?? n);
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      held.forEach((targets) => targets.forEach((t) => t.el.getAnimations().forEach((a) => a.cancel())));
    };
  }, []);

  return null;
}
