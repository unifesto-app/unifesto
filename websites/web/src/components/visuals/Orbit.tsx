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

/** The Unifesto "u" symbol (brand kit path), glyph box x 3..69, y -46..1.6. */
export const U_PATH =
  "M 27.55 1.63 C 22.5 1.63 18.13 0.74 14.44 -1.03 C 10.75 -2.8 7.91 -5.34 5.94 -8.64 C 3.96 -11.94 2.97 -15.84 2.97 -20.34 L 2.97 -46.08 L 19.44 -46.08 L 19.44 -22.05 C 19.44 -17.79 20.75 -14.45 23.39 -12.05 C 26.04 -9.65 29.73 -8.45 34.47 -8.45 C 40.16 -8.45 44.62 -9.92 47.83 -12.86 C 51.05 -15.8 52.66 -19.92 52.66 -25.2 L 52.66 -46.08 L 69.03 -46.08 L 69.03 0 L 54.72 0 L 53.02 -11.44 L 52.92 -11.44 C 50.82 -7.41 47.56 -4.23 43.16 -1.89 C 38.75 0.45 33.55 1.63 27.55 1.63 Z";

/* The Orbit badge: a planet with one satellite on a tilted orbit, in the
   tier's metal. Lead wears the brand glow; the rest are metals. */
export type OrbitTierName = "Lead" | "Bronze" | "Silver" | "Gold";
const METAL: Record<OrbitTierName, { ring: string; core: string; label: string }> = {
  Lead: { ring: "#8fa8ff", core: "#cdd8ff", label: "Orbit Lead" },
  Bronze: { ring: "#b9825a", core: "#e4b48c", label: "Bronze" },
  Silver: { ring: "#b8bdc9", core: "#eef0f5", label: "Silver" },
  Gold: { ring: "#d6ac4e", core: "#f6dc94", label: "Gold" },
};

export function OrbitBadge({ tier, size = 112, withLabel = true }: { tier: OrbitTierName; size?: number; withLabel?: boolean }) {
  const m = METAL[tier];
  const id = `orbit-badge-${tier}`;
  return (
    <figure aria-hidden="true" className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 120 120" className="max-w-full">
        <defs>
          <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={m.core} />
            <stop offset="55%" stopColor={m.ring} />
            <stop offset="100%" stopColor={m.core} />
          </linearGradient>
          {/* Top arc reads left to right over the top; bottom arc runs under
              the bottom (sweep 0) so its text stays upright. */}
          <path id={`${id}-top`} d="M 18 60 A 42 42 0 0 1 102 60" fill="none" />
          <path id={`${id}-bottom`} d="M 15 60 A 45 45 0 0 0 105 60" fill="none" />
        </defs>
        <circle cx="60" cy="60" r="57" fill="#0b0c10" stroke={m.ring} strokeWidth="2" />
        <circle cx="60" cy="60" r="34" fill="none" stroke={m.ring} strokeOpacity="0.3" strokeWidth="1" strokeDasharray="2 4" />
        <text fill={m.ring} fontSize="9" letterSpacing="3.2" fontWeight="600">
          <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">UNIFESTO</textPath>
        </text>
        <text fill={m.ring} fontSize="9" letterSpacing="3.2" fontWeight="600" dominantBaseline="hanging">
          <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">ORBIT</textPath>
        </text>
        {/* Dots between the two words, at 9 and 3 o'clock. */}
        <circle cx="12" cy="60" r="1.8" fill={m.ring} />
        <circle cx="108" cy="60" r="1.8" fill={m.ring} />
        {/* The u inside its orbit: ring behind, moon on the ring. */}
        <ellipse cx="60" cy="60" rx="30" ry="8" fill="none" stroke={m.ring} strokeOpacity="0.45" strokeWidth="1" transform="rotate(-18 60 60)" />
        <path d={U_PATH} fill={`url(#${id}-metal)`} transform="translate(42 72) scale(0.5)" />
        <circle cx="82" cy="48" r="3" fill={m.core} />
      </svg>
      {withLabel && <figcaption className="text-[11px] uppercase tracking-[0.18em] text-paper/70">{m.label}</figcaption>}
    </figure>
  );
}

/* The Orbit certificate, as issued through Unifesto (sample recipient). */
export function OrbitCertificate() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-xl rounded-xl bg-night-2 p-2 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.1),0_30px_60px_-30px_rgba(0,0,0,0.9)]"
    >
      <div className="relative overflow-hidden rounded-lg border border-paper/15 p-6 sm:p-9">
        <div className="pointer-events-none absolute inset-1.5 rounded-md border border-paper/10" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-dashed border-paper/10" />
        <p className="text-[10px] uppercase tracking-[0.28em] text-paper/50">Unifesto Orbit</p>
        <p className="mt-3 font-display text-xl text-paper sm:text-2xl">Certificate of Recognition</p>
        <p className="mt-5 text-[11px] text-paper/55">This certifies that</p>
        <p className="mt-1 font-display text-lg text-paper sm:text-xl">Ananya R.</p>
        <p className="mt-3 max-w-[34ch] text-[12px] leading-relaxed text-paper/70">
          served as Orbit Lead for MRU, Hyderabad, brought 7 clubs onto Unifesto and reached the Bronze tier.
        </p>
        <div className="mt-7 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <svg width="96" height="26" viewBox="0 0 96 26" className="text-paper/70">
              <path d="M2 18c8-12 14-12 12 0s8-14 14-6 4 8 10-2 10-4 12 4 10-2 16-6 12 2 16 0" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <div className="mt-1 w-32 border-t border-paper/25 pt-1 text-[10px] text-paper/55">Founder, Unifesto</div>
          </div>
          <OrbitBadge tier="Bronze" size={64} withLabel={false} />
        </div>
        <p className="mt-5 text-[9px] tracking-wide text-paper/40">March 2027 · Verify at unifesto.app/verify</p>
      </div>
    </div>
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
