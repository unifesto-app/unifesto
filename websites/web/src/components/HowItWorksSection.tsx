"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  MagnifyingGlass,
  Ticket,
  ScanSmiley,
} from "@phosphor-icons/react";

const ease = [0.22, 1, 0.36, 1] as const;

/* Three moments, not three identical cards. Each row is asymmetric:
   a live-feeling product fragment on one side, the plain-spoken step on
   the other. A continuous rail threads the icons together so the whole
   thing reads as one flow \u2014 discover \u2192 register \u2192 walk in. */
const steps = [
  {
    key: "discover",
    kicker: "You, on a Tuesday",
    title: "Find what's actually happening",
    body: "Every fest, workshop and club night in one feed, filtered by what's trending, what's next, and what fits you.",
    icon: MagnifyingGlass,
    Visual: DiscoverVisual,
  },
  {
    key: "register",
    kicker: "Ten seconds later",
    title: "Grab your pass, skip the form",
    body: "RSVP or ticket in a couple of taps. No account for most events, no PDF hunting. Your pass lands straight in the app.",
    icon: Ticket,
    Visual: RegisterVisual,
  },
  {
    key: "attend",
    kicker: "At the gate",
    title: "One scan and you're in",
    body: "Show the QR pass in your app. One scan at any gate, no queue, no fumbling for a screenshot, no printout. Straight through.",
    icon: ScanSmiley,
    Visual: AttendVisual,
  },
];

export default function HowItWorksSection() {
  const reduce = useReducedMotion();

  const row: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.6, ease } },
  };

  return (
    <section
      id="how-it-works"
      aria-labelledby="hiw-heading"
      className="relative bg-canvas py-24 md:py-32 px-6 overflow-hidden"
    >
      {/* Ambient light source, single soft radial \u2014 never a grid/stripe. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(50rem 34rem at 20% 30%, rgba(52,145,255,0.08), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl">
        {/* Header \u2014 confident lead, left-aligned. No tiny tracked eyebrow. */}
        <motion.div
          variants={row}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          className="mb-16 max-w-2xl md:mb-20"
        >
          <h2
            id="hiw-heading"
            className="font-agrandir text-4xl font-bold leading-[0.98] text-white md:text-5xl"
            style={{ letterSpacing: "-0.04em" }}
          >
            From scrolling to{" "}
            <span className="text-primary">standing in the crowd.</span>
          </h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-400">
            No sign-up maze, no printed tickets, no gatekeeper with a
            clipboard. Three moves and you&apos;re inside.
          </p>
        </motion.div>

        {/* The flow. Rows alternate side; a continuous rail threads through. */}
        <ol className="relative">
          <div
            aria-hidden="true"
            className="absolute left-[27px] top-4 bottom-4 hidden w-px md:block"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(52,145,255,0.35) 12%, rgba(52,145,255,0.35) 88%, transparent)",
            }}
          />

          {steps.map((step, i) => {
            const Icon = step.icon;
            const Visual = step.Visual;
            const flip = i % 2 === 1;
            return (
              <motion.li
                key={step.key}
                variants={row}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.5 }}
                className="relative grid grid-cols-1 items-center gap-6 py-6 md:grid-cols-[56px_1fr_1fr] md:gap-10 md:py-9"
              >
                {/* Node marker \u2014 the icon sits on the rail, not a numbered chip. */}
                <div className="flex md:block">
                  <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" weight="bold" aria-hidden="true" />
                  </span>
                </div>

                {/* Copy */}
                <div className={flip ? "md:order-3" : "md:order-2"}>
                  <p className="text-sm font-medium text-primary/80">
                    {step.kicker}
                  </p>
                  <h3 className="mt-1.5 text-xl font-bold text-white md:text-2xl">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 max-w-md text-[15px] leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                </div>

                {/* Product fragment \u2014 a different shape for every step. */}
                <div className={flip ? "md:order-2" : "md:order-3"}>
                  <Visual reduce={!!reduce} />
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* \u2500\u2500 Step visuals: small, real-looking product fragments \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e0e12] p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.9)]">
      {children}
    </div>
  );
}

function DiscoverVisual({ reduce }: { reduce: boolean }) {
  const items = [
    { name: "ESummit\u201926", tag: "Trending", live: true },
    { name: "Hack League", tag: "This week", live: false },
    { name: "MUN Conclave", tag: "Filling up", live: false },
  ];
  return (
    <Shell>
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400">
        <MagnifyingGlass className="h-4 w-4 text-primary" aria-hidden="true" />
        Your event feed
      </div>
      <ul className="space-y-2">
        {items.map((it, idx) => (
          <motion.li
            key={it.name}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 + idx * 0.08, duration: 0.4, ease }}
            className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2"
          >
            <span className="text-sm font-medium text-white">{it.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                it.live
                  ? "bg-primary/15 text-primary"
                  : "bg-white/5 text-slate-400"
              }`}
            >
              {it.tag}
            </span>
          </motion.li>
        ))}
      </ul>
    </Shell>
  );
}

function RegisterVisual({ reduce }: { reduce: boolean }) {
  return (
    <Shell>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">Your pass</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
          Confirmed
        </span>
      </div>
      <div className="rounded-xl bg-gradient-to-br from-primary/[0.14] to-white/[0.02] p-4">
        <p className="text-base font-bold text-white">Hack League 2026</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Seat H-214 · Main Auditorium
        </p>
        <div className="mt-3 flex items-end justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">
              Attendee
            </span>
            <span className="text-sm font-semibold text-white">Ananya R.</span>
          </div>
          {/* A small pass-code motif, not a decorative QR. */}
          <motion.div
            aria-hidden="true"
            initial={reduce ? false : { opacity: 0, scale: 0.9 }}
            whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.4, ease }}
            className="grid grid-cols-4 gap-0.5"
          >
            {Array.from({ length: 16 }).map((_, k) => (
              <span
                key={k}
                className={`h-1.5 w-1.5 rounded-[2px] ${
                  [0, 3, 5, 6, 9, 10, 12, 15].includes(k)
                    ? "bg-primary"
                    : "bg-white/15"
                }`}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </Shell>
  );
}

function AttendVisual({ reduce }: { reduce: boolean }) {
  return (
    <Shell>
      <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400">
        <ScanSmiley className="h-4 w-4 text-primary" aria-hidden="true" />
        Gate 1 · QR check-in
      </div>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black">
        <div className="aspect-[16/9] w-full bg-[radial-gradient(120%_120%_at_50%_0%,rgba(52,145,255,0.14),transparent_55%)]">
          <svg
            viewBox="0 0 200 112"
            className="h-full w-full"
            aria-hidden="true"
          >
            {/* A QR pass being scanned: corner finders, module grid, sweep. */}
            <g transform="translate(72 20)">
              <rect
                x="0"
                y="0"
                width="56"
                height="56"
                rx="6"
                fill="rgba(255,255,255,0.06)"
                stroke="rgba(255,255,255,0.12)"
              />
              {/* three finder squares */}
              {[
                [7, 7],
                [37, 7],
                [7, 37],
              ].map(([fx, fy], i) => (
                <g key={i} transform={`translate(${fx} ${fy})`}>
                  <rect width="12" height="12" rx="2" fill="none" stroke="#3491ff" strokeWidth="2" />
                  <rect x="4" y="4" width="4" height="4" rx="1" fill="#3491ff" />
                </g>
              ))}
              {/* scattered data modules */}
              {[
                [24, 9], [28, 9], [24, 13], [32, 13], [40, 24], [44, 24],
                [24, 28], [28, 32], [32, 28], [44, 32], [9, 24], [13, 28],
                [24, 40], [28, 44], [40, 40], [44, 44], [32, 44], [40, 28],
              ].map(([mx, my], i) => (
                <rect key={i} x={mx} y={my} width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.7)" />
              ))}
            </g>
            {/* scan sweep across the pass */}
            <motion.rect
              x="70"
              width="60"
              height="2"
              fill="#3491ff"
              initial={false}
              animate={reduce ? { y: 48 } : { y: [20, 76, 20] }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      duration: 2.2,
                      ease: [0.77, 0, 0.175, 1],
                      repeat: Infinity,
                    }
              }
              style={{ filter: "drop-shadow(0 0 6px rgba(52,145,255,0.9))" }}
            />
          </svg>
        </div>
      </div>
      <p className="mt-2.5 text-center text-xs font-medium text-slate-400">
        Scanned in <span className="text-white">0.4s</span>
      </p>
    </Shell>
  );
}
