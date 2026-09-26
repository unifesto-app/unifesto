"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  UsersThree,
  CalendarDots,
  ScanSmiley,
  Bank,
  Broadcast,
  Check,
} from "@phosphor-icons/react";
import {
  TeamVisual,
  EventsVisual,
  DoorVisual,
  MoneyVisual,
  GrowVisual,
} from "@/components/features/visuals/PillarVisuals";

/*
  The centrepiece. The platform is genuinely large, so the job here is to make
  that breadth legible instead of burying it in a wall of identical cards.
  Five real pillars, each backed by shipped capabilities (no invented "AI").
  A selectable rail on the left swaps a detail panel on the right; each panel
  carries a purpose-built product fragment so no two pillars look the same.
*/

const ease = [0.22, 1, 0.36, 1] as const;

type Pillar = {
  key: string;
  icon: typeof UsersThree;
  tab: string;
  eyebrow: string;
  title: string;
  lede: string;
  caps: string[];
  Visual: () => React.ReactElement;
};

const PILLARS: Pillar[] = [
  {
    key: "team",
    icon: UsersThree,
    tab: "Team & access",
    eyebrow: "Spaces",
    title: "A Space is your team, not a login.",
    lede: "Clubs, cells, institutions, communities and startups run as Spaces that outlive any single event, with roles that match who actually does what.",
    caps: [
      "Five roles: Space Admin, Curator, Co-Curator, Crew and Judge",
      "An editable permission matrix, tuned per Space",
      "Per-Space billing and plans",
      "Members, co-hosts and ownership transfer",
      "Everything the Space has ever run, in one place",
    ],
    Visual: TeamVisual,
  },
  {
    key: "events",
    icon: CalendarDots,
    tab: "Events",
    eyebrow: "Every shape of event",
    title: "RSVP, ticketed, paid, nested or recurring.",
    lede: "One builder covers a free club night and a three-day fest with sub-events. Set it up once; the Space remembers the rest.",
    caps: [
      "Free RSVP, individual and group registration",
      "Multiple ticket types with capacity and sale windows",
      "Custom forms, agenda, speakers, prizes and FAQs",
      "Big events that nest sub-events three levels deep",
      "Recurring events and standalone online sessions",
      "Waitlists with manual promotion and pay-to-claim",
    ],
    Visual: EventsVisual,
  },
  {
    key: "door",
    icon: ScanSmiley,
    tab: "The door",
    eyebrow: "Event day",
    title: "Run the day, don't run from it.",
    lede: "The QR pass is the ticket. Multiple gates, your Crew scanning at each, and a count you can actually trust.",
    caps: [
      "QR passes minted per registration",
      "Multiple check-in points across one event",
      "Crew scoped to scanning, nothing else",
      "Group check-in, one roster at a time",
      "Manual check-in and duplicate guard",
      "Live attendance as people walk in",
    ],
    Visual: DoorVisual,
  },
  {
    key: "money",
    icon: Bank,
    tab: "Money",
    eyebrow: "Payments & payouts",
    title: "Cash-accurate, not close-enough.",
    lede: "Collect through Razorpay, pay out to a saved account, and reconcile to the rupee. Refunds move through the right hands before money does.",
    caps: [
      "Razorpay checkout for paid tickets",
      "Payouts to saved bank accounts",
      "Two-stage refunds: attendee, Curator, then Admin",
      "Financial roll-ups per Space and platform-wide",
      "Reconciliation for orphaned payments",
    ],
    Visual: MoneyVisual,
  },
  {
    key: "grow",
    icon: Broadcast,
    tab: "Grow",
    eyebrow: "After the door closes",
    title: "The event doesn't end when it ends.",
    lede: "Certificates, leaderboards, sponsors and the follow-up all live here, so the debrief writes itself and the next event starts warmer.",
    caps: [
      "Certificates: templated, batched, publicly verifiable",
      "Hackathon leaderboards with judges and rubrics",
      "Sponsors and leads: roster, portal and booth scan",
      "Email campaigns with scheduling, tracking and A/B",
      "WhatsApp groups, an inbox, and push campaigns",
      "Formatted PDF reports and event analytics",
    ],
    Visual: GrowVisual,
  },
];

export default function PlatformShowcase() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const pillar = PILLARS[active];

  return (
    <section
      id="platform"
      aria-labelledby="platform-heading"
      className="relative bg-canvas py-24 md:py-32"
    >
      {/* Single soft light source, top-left, to give the black some depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(50rem 34rem at 12% 8%, rgba(52,145,255,0.10), transparent 60%)",
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-8">
        {/* ── Section intro ─────────────────────────────────────────── */}
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            The whole loop
          </p>
          <h2
            id="platform-heading"
            className="mt-4 font-agrandir font-bold text-white text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.02] [text-wrap:balance]"
            style={{ letterSpacing: "-0.03em" }}
          >
            One Space runs the whole thing.
          </h2>
          <p className="mt-5 max-w-xl text-base md:text-lg leading-relaxed text-slate-400">
            Most tools hand you a ticket page and wish you luck. Unifesto covers
            the parts that actually break, from the first form to the final
            payout.
          </p>
        </div>

        {/* ── Rail + detail ─────────────────────────────────────────── */}
        <div className="mt-12 grid gap-4 lg:mt-16 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-10">
          {/* Rail: a real tablist, keyboard-navigable. */}
          <div
            role="tablist"
            aria-label="Platform capabilities"
            aria-orientation="vertical"
            className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:pb-0
                       [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {PILLARS.map((p, i) => {
              const selected = i === active;
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  role="tab"
                  id={`platform-tab-${p.key}`}
                  aria-selected={selected}
                  aria-controls={`platform-panel-${p.key}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                      e.preventDefault();
                      setActive((active + 1) % PILLARS.length);
                    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      setActive((active - 1 + PILLARS.length) % PILLARS.length);
                    }
                  }}
                  className={`group relative flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black
                    ${
                      selected
                        ? "border-primary/40 bg-primary/[0.08]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                    }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                      selected
                        ? "bg-primary text-black"
                        : "bg-white/[0.05] text-slate-400 group-hover:text-white"
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" weight="bold" />
                  </span>
                  <span
                    className={`text-sm font-semibold tracking-tight transition-colors duration-200 ${
                      selected ? "text-white" : "text-slate-300 group-hover:text-white"
                    }`}
                  >
                    {p.tab}
                  </span>
                  {/* active edge marker on desktop */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 hidden h-6 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-200 lg:block ${
                      selected ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div
            role="tabpanel"
            id={`platform-panel-${pillar.key}`}
            aria-labelledby={`platform-tab-${pillar.key}`}
            className="relative min-h-[30rem] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={pillar.key}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0.15 : 0.4, ease }}
                className="grid h-full gap-8 p-6 sm:p-8 md:grid-cols-[1fr_minmax(0,22rem)] md:gap-10 lg:p-10"
              >
                {/* Copy + capability list */}
                <div className="flex flex-col">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                    {pillar.eyebrow}
                  </p>
                  <h3
                    className="mt-3 font-agrandir font-bold text-white text-[clamp(1.5rem,2.6vw,2.1rem)] leading-[1.05] [text-wrap:balance]"
                    style={{ letterSpacing: "-0.025em" }}
                  >
                    {pillar.title}
                  </h3>
                  <p className="mt-4 max-w-md text-sm md:text-base leading-relaxed text-slate-400">
                    {pillar.lede}
                  </p>

                  <ul className="mt-6 space-y-2.5">
                    {pillar.caps.map((cap, i) => (
                      <motion.li
                        key={cap}
                        initial={reduce ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: reduce ? 0 : 0.35,
                          ease,
                          delay: reduce ? 0 : 0.12 + i * 0.05,
                        }}
                        className="flex items-start gap-2.5 text-sm text-slate-300"
                      >
                        <Check
                          aria-hidden="true"
                          weight="bold"
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                        />
                        <span>{cap}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Purpose-built product fragment for this pillar */}
                <div className="relative flex items-center justify-center md:items-start">
                  <pillar.Visual />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
