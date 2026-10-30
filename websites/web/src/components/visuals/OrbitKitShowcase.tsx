"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ORBIT_WELCOME_KIT } from "@/lib/site";
import { DUR, EASE_IN_OUT_CUBIC } from "@/lib/motion";
import { OrbitWelcomeKit, type KitEdition } from "./OrbitWelcomeKit";

/* Lead / Crew switch for the welcome kit, styled like the navbar: a soft pill
   slides to the chosen edition, a small dot marks it. Swaps the illustration
   and the numbered list under it (numbers match the markers on the image). */
export function OrbitKitShowcase() {
  const [edition, setEdition] = useState<KitEdition>("lead");
  const reduce = useReducedMotion();
  const kit = ORBIT_WELCOME_KIT[edition];
  return (
    <div>
      <div role="tablist" aria-label="Kit edition" className="inline-flex items-center">
        {(Object.keys(ORBIT_WELCOME_KIT) as KitEdition[]).map((e) => {
          const on = edition === e;
          return (
            <button
              key={e}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setEdition(e)}
              className={`relative z-10 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                on ? "text-paper" : "text-paper/70 hover:text-paper"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="kit-edition"
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-lg bg-paper/[0.08]"
                  transition={reduce ? { duration: 0 } : { duration: DUR.swap, ease: EASE_IN_OUT_CUBIC }}
                />
              )}
              {ORBIT_WELCOME_KIT[e].label}
              {on && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-[15px] font-light leading-relaxed text-paper/65 md:text-base">{kit.lede}</p>

      <div className="mt-8" role="tabpanel">
        <OrbitWelcomeKit edition={edition} />
      </div>

      <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        {kit.items.map((k, i) => (
          <li key={k.name} className="flex gap-3">
            <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper text-[12px] font-semibold text-night">
              {i + 1}
            </span>
            <div>
              <p className="text-sm text-paper">{k.name}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-paper/60">{k.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
