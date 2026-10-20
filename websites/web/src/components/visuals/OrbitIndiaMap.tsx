"use client";

import { useState } from "react";
import { INDIA_PATH, INDIA_STATES_PATH, INDIA_VIEWBOX, indiaPoint } from "./india-outline";

/* Unifesto Orbit across India: every city with applications is a node, wired
   back to the Hyderabad hub like a network in orbit. Dot size follows the
   city's application count (square root, so big cities don't drown the map).
   Hover, tap or focus a node to see its colleges. */

export type OrbitCity = {
  city: string;
  lon: number;
  lat: number;
  colleges: { name: string; count: number }[];
};

const HUB = { city: "Hyderabad", lon: 78.4867, lat: 17.385 };
const { width: W, height: H } = INDIA_VIEWBOX;

const total = (c: OrbitCity) => c.colleges.reduce((n, k) => n + k.count, 0);
// Small and capped: grows a little with applications so lines and cities stay readable.
const radius = (n: number) => Math.min(15, 4 + 2 * Math.sqrt(n));

/** A gentle arc from the hub to a city: control point pushed off the chord. */
function arc(x1: number, y1: number, x2: number, y2: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const bend = 0.22;
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${(mx - dy * bend).toFixed(1)},${(my + dx * bend).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

export function OrbitIndiaMap({
  cities,
  totals,
}: {
  cities: OrbitCity[];
  totals: { applications: number; cities: number; colleges: number };
}) {
  const [active, setActive] = useState<string | null>(null);
  const hub = indiaPoint(HUB.lon, HUB.lat);
  const nodes = cities
    .map((c) => ({ ...c, ...indiaPoint(c.lon, c.lat), n: total(c) }))
    .sort((a, b) => b.n - a.n);
  const current = nodes.find((c) => c.city === active) ?? null;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center">
      <div className="min-w-0">
        <dl className="grid grid-cols-3 gap-4">
          {[
            ["Applications", totals.applications],
            ["Cities", totals.cities],
            ["Colleges", totals.colleges],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-night-2 p-4 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.08)]">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-paper/50">{k}</dt>
              <dd className="mt-1 font-display text-2xl tabular-nums text-paper">{v}</dd>
            </div>
          ))}
        </dl>
        <ol className="mt-8 space-y-2">
          {nodes.slice(0, 6).map((c) => (
            <li key={c.city}>
              <button
                type="button"
                onMouseEnter={() => setActive(c.city)}
                onFocus={() => setActive(c.city)}
                onClick={() => setActive(c.city)}
                className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition-colors ${
                  active === c.city ? "bg-night-2 text-paper" : "text-paper/70 hover:bg-night-2/60"
                }`}
              >
                <span>{c.city}</span>
                <span className="tabular-nums text-paper/50">{c.n}</span>
              </button>
            </li>
          ))}
        </ol>
        {nodes.length === 0 && (
          <p className="mt-8 max-w-[40ch] text-sm leading-relaxed text-paper/65">
            Applications just opened. Your campus could be the first dot on the map.
          </p>
        )}
      </div>

      <div className="relative min-w-0" onMouseLeave={() => setActive(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of India showing where Orbit applications come from">
          <defs>
            <radialGradient id="orbit-node" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="var(--primary-bright)" />
              <stop offset="100%" stopColor="rgb(var(--glow) / 0.35)" />
            </radialGradient>
          </defs>

          <path d={INDIA_PATH} fill="rgb(var(--glow) / 0.035)" stroke="rgb(var(--glow) / 0.32)" strokeWidth="1.4" strokeLinejoin="round" />
          <path d={INDIA_STATES_PATH} fill="none" stroke="rgb(var(--glow) / 0.12)" strokeWidth="0.8" strokeLinejoin="round" />

          {/* Orbit rings around the hub. */}
          {[70, 140, 230].map((r, i) => (
            <circle
              key={r}
              cx={hub.x}
              cy={hub.y}
              r={r}
              fill="none"
              stroke="rgb(var(--glow) / 0.12)"
              strokeWidth="1"
              strokeDasharray="3 9"
              className="orbit-ring motion-reduce:!animate-none"
              style={{ transformOrigin: `${hub.x}px ${hub.y}px`, animationDuration: `${80 + i * 40}s`, animationDirection: i % 2 ? "reverse" : "normal" }}
            />
          ))}

          {/* The network: an arc from the hub to every city, with a travelling pulse. */}
          {nodes.map((c, i) => {
            if (c.city === HUB.city) return null;
            const d = arc(hub.x, hub.y, c.x, c.y);
            const on = active === c.city;
            return (
              <g key={`arc-${c.city}`}>
                <path d={d} fill="none" stroke={`rgb(var(--glow) / ${on ? 0.55 : 0.18})`} strokeWidth={on ? 1.8 : 1.1} />
                <path
                  d={d}
                  fill="none"
                  stroke="var(--primary-bright)"
                  strokeOpacity="0.7"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeDasharray="6 400"
                  className="orbit-pulse motion-reduce:hidden"
                  style={{ animationDelay: `${(i * 0.37) % 3}s` }}
                />
              </g>
            );
          })}

          {/* Hub. */}
          <circle cx={hub.x} cy={hub.y} r="6" fill="var(--primary-bright)" />
          <circle cx={hub.x} cy={hub.y} r="12" fill="none" stroke="rgb(var(--glow) / 0.4)" />

          {/* City nodes. */}
          {nodes.map((c) => {
            const r = radius(c.n);
            const on = active === c.city;
            return (
              <g
                key={c.city}
                role="button"
                tabIndex={0}
                aria-label={`${c.city}: ${c.n} applications from ${c.colleges.length} colleges`}
                onMouseEnter={() => setActive(c.city)}
                onFocus={() => setActive(c.city)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(on ? null : c.city)}
                onKeyDown={(e) => e.key === "Escape" && setActive(null)}
                className="cursor-pointer outline-none"
              >
                <circle cx={c.x} cy={c.y} r={r + 7} fill="rgb(var(--glow) / 0.07)" className={on ? "" : "orbit-halo motion-reduce:!animate-none"} style={{ transformOrigin: `${c.x}px ${c.y}px` }} />
                <circle cx={c.x} cy={c.y} r={r} fill="url(#orbit-node)" stroke={on ? "var(--primary-bright)" : "rgb(var(--glow) / 0.5)"} strokeWidth={on ? 2.5 : 1.2} />
              </g>
            );
          })}
        </svg>

        <p className="mt-2 text-right text-[10px] text-paper/40">Boundaries: DataMeet (CC BY 4.0)</p>

        {current && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-60 max-w-[70%] rounded-2xl bg-night-2 p-4 shadow-[inset_0_0_0_1px_rgb(var(--glow)/0.14),0_24px_48px_-20px_rgba(0,0,0,0.9)]"
            style={{
              left: `${(current.x / W) * 100}%`,
              top: `${(current.y / H) * 100}%`,
              transform: `translate(${current.x / W > 0.55 ? "calc(-100% - 18px)" : "18px"}, ${current.y / H > 0.6 ? "-100%" : "-12px"})`,
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-base text-paper">{current.city}</span>
              <span className="text-[12px] tabular-nums text-paper/60">{current.n} applications</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {[...current.colleges]
                // The API already orders them, with "Other colleges" last.
                .slice(0, 6)
                .map((k) => (
                  <li key={k.name} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="min-w-0 truncate text-paper/80">{k.name}</span>
                    <span className="shrink-0 tabular-nums text-paper/55">{k.count}</span>
                  </li>
                ))}
            </ul>
            {current.colleges.length > 6 && (
              <p className="mt-2 text-[11px] text-paper/45">and {current.colleges.length - 6} more colleges</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
