import type { CSSProperties, ReactNode } from "react";
import { Panel } from "@/components/visuals/Product";

/* Unifesto Orbit fragments: a campus drawn as a small solar system (clubs
   circling a Unifesto core), the Orbit Lead's ID card, the start-period
   tracker and a pinned notice. CSS only; the orbits spin with
   motion-safe and stop under prefers-reduced-motion. Decorative. */

type Body = { label: string; at: number };
const RINGS: { inset: string; secs: number; bodies: Body[] }[] = [
  { inset: "28%", secs: 70, bodies: [{ label: "Coding club", at: 30 }, { label: "Music", at: 210 }] },
  { inset: "15%", secs: 110, bodies: [{ label: "Dance crew", at: 120 }, { label: "E-Cell", at: 300 }] },
  { inset: "2%", secs: 160, bodies: [{ label: "TEDx", at: 70 }, { label: "Fest committee", at: 180 }, { label: "Robotics", at: 315 }] },
];

const spin = (secs: number, reverse = false): CSSProperties => ({
  animationName: "orbit-spin",
  animationDuration: `${secs}s`,
  animationTimingFunction: "linear",
  animationIterationCount: "infinite",
  animationDirection: reverse ? "reverse" : "normal",
});

export function OrbitSystem() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[26rem]">
      {RINGS.map((r) => (
        <div
          key={r.inset}
          className="absolute rounded-full shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.12)] motion-reduce:!animate-none"
          style={{ inset: r.inset, ...spin(r.secs) }}
        >
          {r.bodies.map((b) => (
            <div key={b.label} className="absolute inset-0" style={{ transform: `rotate(${b.at}deg)` }}>
              <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
                <div style={{ transform: `rotate(${-b.at}deg)` }}>
                  {/* Counter-spins at the ring's speed so the label stays upright. */}
                  <span
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-night-2 py-1 pl-1 pr-2.5 text-[10px] text-paper/80 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.1)] motion-reduce:!animate-none"
                    style={spin(r.secs, true)}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--primary-bright),rgb(var(--glow)/0.25))]" />
                    {b.label}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
      <div className="absolute inset-[40%] grid place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--primary-bright),var(--sand)_70%)] shadow-[0_0_60px_rgb(var(--glow)/0.25)]">
        <span className="font-display text-[11px] text-night">Unifesto</span>
      </div>
    </div>
  );
}

/* The Lead's college-style ID card, lanyard slot and all. */
export function OrbitIdCard() {
  const rows: [string, string][] = [
    ["Name", "Ananya R."],
    ["Campus", "MRU, Hyderabad"],
    ["Active clubs", "7"],
    ["Tier", "Bronze"],
  ];
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-sm overflow-hidden rounded-2xl bg-night-2 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08),0_30px_60px_-30px_rgba(0,0,0,0.9)]"
    >
      <div className="flex justify-center pt-3">
        <span className="h-1.5 w-12 rounded-full bg-night" />
      </div>
      <div className="mt-3 flex items-center justify-between bg-night-3 px-4 py-2">
        <span className="font-display text-[12px] text-paper">Unifesto Orbit</span>
        <span className="text-[9px] uppercase tracking-[0.18em] text-paper/50">Orbit Lead</span>
      </div>
      <div className="flex gap-4 p-4">
        <div className="grid h-24 w-20 shrink-0 place-items-center rounded-md bg-[radial-gradient(120%_90%_at_80%_0%,rgb(var(--glow)/0.22),transparent_60%),linear-gradient(160deg,var(--sand),var(--night-2))] font-display text-lg text-paper/70">
          AR
        </div>
        <div className="flex-1 space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-[10px]">
              <span className="text-paper/50">{k}</span>
              <span className="text-paper">{v}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-end justify-between gap-4 px-4 pb-4">
        <span className="text-[9px] leading-snug text-paper/50">Represents Unifesto, not the college.</span>
        <span className="flex h-6 items-stretch gap-[2px]">
          {[2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2].map((w, i) => (
            <span key={i} className="bg-paper/40" style={{ width: w }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/* The first 30 days, as the Lead sees them. */
export function OrbitStartVisual() {
  const clubs: [string, string][] = [
    ["Coding Club", "Joined campus"],
    ["Dance Crew", "Creating Space"],
  ];
  return (
    <Panel title="My start period">
      <div className="flex items-baseline justify-between">
        <span className="font-display tabular text-sm text-paper">Day 12 of 30</span>
        <span className="text-[10px] text-paper/50">1 of 2 clubs onboarded</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-night-3">
        <div className="h-full w-[40%] rounded-full bg-primary" />
      </div>
      <div className="mt-3 space-y-1.5">
        {clubs.map(([n, s]) => (
          <div key={n} className="flex items-center justify-between rounded-md bg-night-3 px-2.5 py-2 text-[10px]">
            <span className="text-paper">{n}</span>
            <span className="text-paper/60">{s}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* A pinned sheet on the campus notice board. */
export function Pinned({ tilt = 0, className = "", children }: { tilt?: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={`relative rounded-lg bg-night-2 p-5 pt-6 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08),0_24px_40px_-24px_rgba(0,0,0,0.9)] ${className}`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <span aria-hidden="true" className="absolute -top-1.5 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--primary-bright),rgb(var(--glow)/0.3))] shadow-[0_3px_6px_rgba(0,0,0,0.6)]" />
      {children}
    </div>
  );
}
