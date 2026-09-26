"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { Lightning, Ticket, ChartBar, Users, ArrowRight, QrCode } from "@phosphor-icons/react";

/* Outcomes an organiser feels on event day, not a feature inventory. */
const features = [
  { icon: <Lightning className="w-5 h-5" weight="regular" />, text: "Publish tonight, registrations by morning" },
  { icon: <Ticket className="w-5 h-5" weight="regular" />, text: "Passes, payments and the gate, handled" },
  { icon: <ChartBar className="w-5 h-5" weight="regular" />, text: "Watch the room fill in real time" },
  { icon: <Users className="w-5 h-5" weight="regular" />, text: "10,000+ students already on the other side" },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function OrganizerPitchSection() {
  const reduce = useReducedMotion();

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
  };
  const item: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
  };
  const panel: Variants = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease, delay: 0.15 } },
  };

  return (
    <section id="host" aria-labelledby="organizer-heading" className="relative bg-canvas py-20 md:py-28 px-6 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(44rem 28rem at 82% 30%, rgba(52,145,255,0.08), transparent 62%)",
        }}
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left: text */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
          >
            <motion.p variants={item} className="mb-3 text-sm font-medium text-primary">
              For organizers
            </motion.p>
            <motion.h2 variants={item} id="organizer-heading" className="text-3xl md:text-5xl font-extrabold text-white leading-[1.08] [text-wrap:balance] mb-5">
              Host events that{" "}
              <span className="text-primary">actually get attended.</span>
            </motion.h2>
            <motion.p variants={item} className="text-slate-300 text-base leading-relaxed mb-8 max-w-md">
              Stop chasing RSVPs on WhatsApp groups. Unifesto gives every organizer a single command center to create, promote, and manage events.
            </motion.p>

            {/* Feature bullets — bare glyphs, matching the hero panel's grammar. */}
            <motion.ul variants={item} className="flex flex-col gap-3.5 mb-10">
              {features.map((f) => (
                <li key={f.text} className="flex items-center gap-3">
                  <span className="flex-shrink-0 text-primary">{f.icon}</span>
                  <span className="text-sm text-slate-300">{f.text}</span>
                </li>
              ))}
            </motion.ul>

            <motion.div variants={item} whileTap={reduce ? undefined : { scale: 0.97 }} className="inline-block">
              <a
                id="organizer-start-hosting"
                href="/host"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5"
              >
                Start Hosting
                <ArrowRight className="w-4 h-4" weight="bold" />
              </a>
            </motion.div>
          </motion.div>

          {/* Right: visual card */}
          <motion.div
            variants={panel}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.4 }}
            className="relative"
          >
            {/* Same surface grammar as the hero panel: one solid plate,
               rows separated by rules, status as bare accent text. */}
            <div className="rounded-2xl border border-white/10 bg-[#0e0e12] p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
              {/* Mock dashboard header */}
              <div className="flex items-center justify-between px-1 pb-4">
                <div>
                  <p className="text-xs text-slate-400">Your event</p>
                  <p className="text-base font-bold text-white">Hack League 2026</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  Live
                </span>
              </div>
              {/* Live figures: rules, not boxes */}
              <div className="grid grid-cols-3 divide-x divide-white/[0.07] border-y border-white/[0.07] py-4">
                {[
                  { label: "Registered", value: "312" },
                  { label: "Checked in", value: "289" },
                  { label: "At the gate", value: "23" },
                ].map((s) => (
                  <div key={s.label} className="px-3 text-center first:pl-1 last:pr-1">
                    <p className="text-xl font-bold text-white">{s.value}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Gate status: a row, not a card in a card */}
              <div className="flex items-center gap-3 px-1 pt-4">
                <QrCode className="h-5 w-5 flex-shrink-0 text-primary" weight="regular" aria-hidden="true" />
                <div>
                  <p className="text-xs font-semibold text-white">Check-in running at both gates</p>
                  <p className="text-xs text-slate-400">Gate 1 &amp; Gate 2 · nobody&apos;s queuing</p>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
