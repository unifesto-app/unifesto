"use client";

import { useEffect } from "react";

/* Makes the hero sky respond to the visitor: layers drift at different
   depths as the pointer moves. Writes two CSS variables on the backdrop
   once per frame; every layer moves with the
   individual `translate` property (compositor-only, composes with the
   layers' own transform animations). Fine pointers only; off under reduced
   motion. Runs after hydration, so it never races React. */
export default function CosmosPointer({ targetId }: { targetId: string }) {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const section = document.getElementById(targetId);
    const sky = section?.querySelector<HTMLElement>(".cosmos");
    if (!fine || reduce || !section || !sky) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const r = section.getBoundingClientRect();
      sky.style.setProperty("--mx", ((x - r.left) / r.width - 0.5).toFixed(3));
      sky.style.setProperty("--my", ((y - r.top) / r.height - 0.5).toFixed(3));
    };
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      sky.style.setProperty("--mx", "0");
      sky.style.setProperty("--my", "0");
    };

    section.addEventListener("pointermove", move, { passive: true });
    section.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave);
    };
  }, [targetId]);

  return null;
}
