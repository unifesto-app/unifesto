"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowRight,
  UsersThree,
  CalendarCheck,
  ScanSmiley,
  Bank,
} from "@phosphor-icons/react";

/* One orchestrated page-load. Reveals enhance already-visible content;
   with prefers-reduced-motion the content simply appears. */
const ease = [0.22, 1, 0.36, 1] as const;

/* The right panel is the whole product in miniature: the same loop the page
   goes on to expand below. One Space carries an event from setup to payout,
   so the hero already tells the platform story, not a single feature. */
const LOOP = [
  {
    icon: UsersThree,
    label: "Space created",
    detail: "I&E Cell · 4 curators, 9 crew",
  },
  {
    icon: CalendarCheck,
    label: "Event live",
    detail: "Nav Nirman 4.0 · 412 registered",
  },
  {
    icon: ScanSmiley,
    label: "Doors open",
    detail: "387 in · 3 gates · 0.4s each",
  },
  {
    icon: Bank,
    label: "Paid out",
    detail: "₹1,36,273 · reconciled",
  },
] as const;

export default function Hero() {
  const reduce = useReducedMotion();

  /* Only run the entrance after mount. On the server and first client paint
     the content renders visible (no injected hidden styles), so SSR and
     hydration markup match, then the reveal plays. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const container: Variants = {
    hidden: {},
    show: {
      transition: {
        staggerChildren: reduce ? 0 : 0.08,
        delayChildren: reduce ? 0 : 0.05,
      },
    },
  };

  const item: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 12, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: reduce ? 0 : 0.55, ease },
    },
  };

  const panel: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 24, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: reduce ? 0 : 0.7, ease, delay: reduce ? 0 : 0.15 },
    },
  };

  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="relative min-h-[100dvh] flex items-center bg-canvas overflow-hidden"
    >
      {/* Ambient depth: a single soft radial from the accent, low opacity. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(60rem 40rem at 78% 18%, rgba(52,145,255,0.14), transparent 60%)",
        }}
      />

      <motion.div
        variants={container}
        initial={mounted ? "hidden" : false}
        animate={mounted ? "show" : false}
        className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-8 pt-28 pb-20 md:py-0
                   grid items-center gap-12 lg:gap-16 lg:grid-cols-[1.05fr_0.95fr]"
      >
        {/* ── Left: the positioning, spoken plainly ──────────────────── */}
        <div className="max-w-2xl">
          {/* Live badge: real proof (named place), not a stat cliche */}
          <motion.div
            variants={item}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium tracking-wide text-slate-300">
              Live across Hyderabad campuses
            </span>
          </motion.div>

          {/* Heading: solid white, the promise in solid electric blue.
              Emphasis by color + weight, never gradient text. */}
          <motion.h1
            id="hero-heading"
            variants={item}
            className="mt-6 font-agrandir font-bold text-white
                       text-[clamp(2.4rem,6vw,4.75rem)] leading-[1.0]
                       [text-wrap:balance]"
            style={{ letterSpacing: "-0.045em" }}
          >
            Run the whole event.{" "}
            <span className="text-primary">Not just the ticket page.</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-lg text-base md:text-lg leading-relaxed text-slate-400"
          >
            The team, the tickets, the door, the money and the debrief, in one
            Space that outlives any single event.{" "}
            <span className="font-semibold text-white">
              Built by organisers who lived the chaos
            </span>
            , for clubs, communities, institutions and startups.
          </motion.p>

          {/* CTAs: solid primary, real bordered secondary. */}
          <motion.div
            variants={item}
            className="mt-9 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <motion.div whileTap={reduce ? undefined : { scale: 0.97 }}>
              <Link
                id="hero-host-event"
                href="/#host"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary
                           px-6 py-3.5 text-base font-semibold text-black
                           transition-colors duration-200 hover:bg-[#1f83ff]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Host an event
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  weight="bold"
                />
              </Link>
            </motion.div>
            <motion.div whileTap={reduce ? undefined : { scale: 0.97 }}>
              <Link
                id="hero-discover-events"
                href="/events"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15
                           bg-white/[0.02] px-6 py-3.5 text-base font-semibold text-white
                           transition-colors duration-200 hover:border-white/30 hover:bg-white/[0.06]
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Discover events
              </Link>
            </motion.div>
          </motion.div>

          {/* Inline proof: woven into a sentence, names the kinds of
              organisers running on this, not just a headcount. */}
          <motion.p variants={item} className="mt-8 text-sm text-slate-400">
            <span className="font-semibold text-slate-300">10,000+ attendees</span>{" "}
            checked in across{" "}
            <span className="font-semibold text-slate-300">25+ events</span>, run
            by clubs, communities and institutions. Free to start.
          </motion.p>
        </div>

        {/* ── Right: one Space carries an event from setup to payout ──── */}
        <motion.div variants={panel} className="relative">
          <div className="relative mx-auto w-full max-w-md rounded-2xl border border-white/10 bg-[#0e0e12] p-4 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
            {/* Window chrome: this is one Space, running one event */}
            <div className="mb-1 flex items-center justify-between px-1 pb-3">
              <div className="text-xs font-medium text-slate-400">
                I&amp;E Cell · Space
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Live
              </span>
            </div>

            {/* The loop. A rail threads the stages so it reads as one flow. */}
            <ul className="relative border-t border-white/[0.07] pt-1">
              {LOOP.map((stage, i) => (
                <LoopRow
                  key={stage.label}
                  stage={stage}
                  index={i}
                  isLast={i === LOOP.length - 1}
                  mounted={mounted}
                  reduce={!!reduce}
                />
              ))}
            </ul>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/* One stage of the loop. The icon sits on a continuous rail; each row resolves
   a beat after the last, so the visitor watches the event move through the
   platform rather than reading four static bullets. */
function LoopRow({
  stage,
  index,
  isLast,
  mounted,
  reduce,
}: {
  stage: (typeof LOOP)[number];
  index: number;
  isLast: boolean;
  mounted: boolean;
  reduce: boolean;
}) {
  const Icon = stage.icon;
  const delay = 0.55 + index * 0.3;

  return (
    <li className="relative flex items-start gap-3.5 py-3">
      {/* rail segment beneath this node */}
      {!isLast && (
        <motion.span
          aria-hidden="true"
          className="absolute left-[15px] top-9 h-[calc(100%-1.25rem)] w-px origin-top bg-gradient-to-b from-primary/50 to-white/10"
          initial={mounted && !reduce ? { scaleY: 0 } : false}
          animate={mounted ? { scaleY: 1 } : false}
          transition={reduce ? { duration: 0 } : { duration: 0.4, ease, delay: delay + 0.1 }}
        />
      )}

      <motion.span
        aria-hidden="true"
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/[0.12] text-primary"
        initial={mounted && !reduce ? { opacity: 0, scale: 0.7 } : false}
        animate={mounted ? { opacity: 1, scale: 1 } : false}
        transition={
          reduce ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.3, delay }
        }
      >
        <Icon className="h-4 w-4" weight="bold" />
      </motion.span>

      <motion.div
        className="min-w-0 flex-1 pt-0.5"
        initial={mounted && !reduce ? { opacity: 0, y: 4 } : false}
        animate={mounted ? { opacity: 1, y: 0 } : false}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease, delay: delay + 0.05 }}
      >
        <p className="text-sm font-semibold text-white">{stage.label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
          {stage.detail}
        </p>
      </motion.div>
    </li>
  );
}
