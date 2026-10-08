import type { ReactNode } from "react";
import { Check } from "@unifesto/unicon/react";

/* One idea, half words and half picture. Rows alternate sides so a run of
   them reads as a sequence, not a template. The heading level is a prop so
   the page outline stays correct wherever a row sits. */
export default function FeatureRow({
  id,
  title,
  lede,
  points,
  visual,
  flip = false,
  as: H = "h3",
  children,
}: {
  id?: string;
  title: string;
  lede: string;
  points?: readonly string[];
  visual: ReactNode;
  flip?: boolean;
  as?: "h2" | "h3";
  children?: ReactNode;
}) {
  return (
    <div className="grid items-center gap-10 py-12 md:grid-cols-2 md:gap-16 md:py-16">
      <div className={flip ? "md:order-2" : ""}>
        <H id={id} data-reveal="clip" className="scroll-mt-28 font-display text-[clamp(1.35rem,2.6vw,2rem)] leading-[1.15] text-paper [text-wrap:balance]">
          {title}
        </H>
        <p data-reveal="blur" className="mt-4 max-w-[52ch] text-[15px] font-light leading-relaxed text-paper/65 md:text-base">
          {lede}
        </p>
        {points && (
          <ul data-stagger="rise" className="mt-6 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-sm leading-relaxed text-paper/80">
                <Check weight="bold" aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0 text-paper/50" />
                {p}
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
      <div data-reveal="scale" className={`flex justify-center ${flip ? "md:order-1 md:justify-start" : "md:justify-end"}`}>
        {visual}
      </div>
    </div>
  );
}
