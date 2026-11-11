"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type RevealProps = {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  /** Rise distance in px. */
  y?: number;
  delay?: number;
  /** Stagger direct children (or elements marked data-reveal-item). */
  stagger?: boolean;
  /** "scroll" fires when scrolled into view; "load" plays once on mount. */
  trigger?: "scroll" | "load";
  id?: string;
};

/*
  Scroll-triggered entrance. The start-state is applied in JS only, so the
  default (SSR / no-JS / reduced-motion) render shows the content — the reveal
  enhances something already visible rather than gating it. Reduced-motion
  visitors get the content with no animation.
*/
export default function Reveal({
  children,
  as: Tag = "div",
  className = "",
  y = 26,
  delay = 0,
  stagger = false,
  trigger = "scroll",
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const targets = stagger
        ? (el.querySelectorAll<HTMLElement>("[data-reveal-item]").length
            ? el.querySelectorAll<HTMLElement>("[data-reveal-item]")
            : el.children)
        : el;

      gsap.fromTo(
        targets,
        { autoAlpha: 0, y },
        {
          autoAlpha: 1,
          y: 0,
          duration: trigger === "load" ? 1 : 0.85,
          delay,
          ease: "power3.out",
          stagger: stagger ? (trigger === "load" ? 0.11 : 0.09) : 0,
          ...(trigger === "scroll"
            ? {
                scrollTrigger: {
                  trigger: el,
                  start: "top 85%",
                  once: true,
                },
              }
            : {}),
        }
      );
    }, ref);

    return () => ctx.revert();
  }, [y, delay, stagger, trigger]);

  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      id={id}
      className={`will-reveal ${className}`}
    >
      {children}
    </Tag>
  );
}
