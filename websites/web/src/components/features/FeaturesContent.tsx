"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from "motion/react";
import {
  UsersThree,
  CalendarDots,
  ScanSmiley,
  Bank,
  Broadcast,
  ArrowRight,
  Check,
} from "@phosphor-icons/react";

import {
  TeamVisual,
  EventsVisual,
  DoorVisual,
  MoneyVisual,
  GrowVisual,
} from "./visuals/PillarVisuals";

const ease = [0.22, 1, 0.36, 1] as const;

type Capability = { title: string; desc: string };

type Feature = {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  lede: string;
  capabilities: Capability[];
  platforms: string[];
  cta: { label: string; href: string };
  Icon: typeof UsersThree;
  Visual: () => React.ReactElement;
};

const FEATURES: Feature[] = [
  {
    id: "team",
    index: "01",
    eyebrow: "Team & access",
    title: "A Space is your team, not a login.",
    lede: "Clubs, cells, institutions, communities and startups run as Spaces that outlive any single event. Roles map to who actually does what, so a scanner at the door never sees the bank account.",
    capabilities: [
      { title: "Five roles", desc: "Space Admin, Curator, Co-Curator, Crew and Judge." },
      { title: "Permission matrix", desc: "Editable per Space, tuned to your team." },
      { title: "Per-Space billing", desc: "Each Space carries its own plan and money." },
      { title: "Members & co-hosts", desc: "Invite the team; co-host across Spaces." },
      { title: "Ownership transfer", desc: "Hand a Space or event to the next lead." },
      { title: "One home", desc: "Every event the Space has ever run, together." },
    ],
    platforms: ["Space Workspace", "App"],
    cta: { label: "Start a Space", href: "/#host" },
    Icon: UsersThree,
    Visual: TeamVisual,
  },
  {
    id: "events",
    index: "02",
    eyebrow: "Events",
    title: "RSVP, ticketed, paid, nested or recurring.",
    lede: "One builder covers a free club night and a three-day fest with its own sub-events. Set the shape once, collect exactly the details you need, and let the Space remember the rest.",
    capabilities: [
      { title: "RSVP & tickets", desc: "Free RSVP, individual and group registration." },
      { title: "Ticket types", desc: "Multiple tiers with capacity and sale windows." },
      { title: "Custom forms", desc: "Agenda, speakers, prizes, FAQs and your fields." },
      { title: "Sub-events", desc: "Big events nest sub-events three levels deep." },
      { title: "Recurring & sessions", desc: "Repeat series and standalone online sessions." },
      { title: "Waitlists", desc: "Manual promotion and pay-to-claim seats." },
    ],
    platforms: ["Space Workspace", "Website", "App"],
    cta: { label: "Create an event", href: "/#host" },
    Icon: CalendarDots,
    Visual: EventsVisual,
  },
  {
    id: "door",
    index: "03",
    eyebrow: "The door",
    title: "Run the day, don't run from it.",
    lede: "The QR pass minted at registration is the ticket. Open several gates, put your Crew on each one, and watch a count you can actually trust as the room fills.",
    capabilities: [
      { title: "QR passes", desc: "A distinct code minted per registration." },
      { title: "Multi-point check-in", desc: "Several gates across one event." },
      { title: "Crew scanning", desc: "Crew scoped to the door, nothing else." },
      { title: "Group check-in", desc: "Wave in a whole roster at once." },
      { title: "Manual & duplicate guard", desc: "Check in by hand; catch repeat entries." },
      { title: "Live attendance", desc: "Counts update as people walk in." },
    ],
    platforms: ["App"],
    cta: { label: "See the door", href: "/#host" },
    Icon: ScanSmiley,
    Visual: DoorVisual,
  },
  {
    id: "money",
    index: "04",
    eyebrow: "Money",
    title: "Cash-accurate, not close-enough.",
    lede: "Collect paid tickets through Razorpay, pay out to a saved bank account, and reconcile to the rupee. Refunds move through the right hands before any money does.",
    capabilities: [
      { title: "Razorpay checkout", desc: "Integrated gateway for paid tickets." },
      { title: "Bank payouts", desc: "Pay out to saved payout accounts." },
      { title: "Two-stage refunds", desc: "Attendee, then Curator, then Admin." },
      { title: "Financial roll-ups", desc: "Cash-accurate, per Space and platform-wide." },
      { title: "Reconciliation", desc: "Catch and attach orphaned payments." },
      { title: "Clear fees", desc: "The processing fee is set per plan, up front." },
    ],
    platforms: ["Space Workspace"],
    cta: { label: "Start hosting", href: "/#host" },
    Icon: Bank,
    Visual: MoneyVisual,
  },
  {
    id: "grow",
    index: "05",
    eyebrow: "Grow",
    title: "The event doesn't end when it ends.",
    lede: "Certificates, hackathon leaderboards, sponsor leads and the follow-up all live here, so the debrief writes itself and the next event starts warmer than the last.",
    capabilities: [
      { title: "Certificates", desc: "Templated, batched and publicly verifiable." },
      { title: "Leaderboards", desc: "Rubric or metric scoring, with judges." },
      { title: "Sponsors & leads", desc: "Roster, tiers, a portal and booth-scan capture." },
      { title: "Email campaigns", desc: "Templates, scheduling, tracking and A/B." },
      { title: "WhatsApp & push", desc: "Groups, an inbox and push campaigns." },
      { title: "Reports & analytics", desc: "Formatted PDF reports and event insight." },
    ],
    platforms: ["Space Workspace", "Sponsor Portal"],
    cta: { label: "Start hosting", href: "/#host" },
    Icon: Broadcast,
    Visual: GrowVisual,
  },
];

export default function FeaturesContent() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(FEATURES[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const flowRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: flowRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    const els = Object.values(sectionRefs.current).filter(Boolean) as Element[];
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const fade: Variants = {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 22, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: reduce ? 0 : 0.6, ease },
    },
  };

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-36 pb-16 md:pb-24">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(55rem 34rem at 78% 8%, rgba(52,145,255,0.16), transparent 62%)",
          }}
        />
        <motion.div
          initial={reduce ? false : "hidden"}
          animate={reduce ? undefined : "show"}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.04 } },
          }}
          className="relative z-10 mx-auto max-w-5xl"
        >
          <motion.div
            variants={fade}
            className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-xs font-medium tracking-wide text-slate-300">
              Five pillars, one platform
            </span>
          </motion.div>

          <motion.h1
            variants={fade}
            className="mt-6 max-w-3xl font-agrandir text-[clamp(2.5rem,6.4vw,5rem)] font-bold leading-[0.98] text-white [text-wrap:balance]"
            style={{ letterSpacing: "-0.04em" }}
          >
            Everything an event needs, and{" "}
            <span className="text-primary">nothing it doesn&apos;t.</span>
          </motion.h1>

          <motion.p
            variants={fade}
            className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 md:text-lg"
          >
            Team, events, the door, the money and the growth after: five parts
            of one platform that take an event from a first form to the final
            payout, without a spreadsheet in between.
          </motion.p>

          {/* Meta strip, replaces the chip nav; the sticky tab-bar below handles jumps */}
          <motion.dl
            variants={fade}
            className="mt-12 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 border-t border-white/[0.08] pt-8 sm:grid-cols-4"
          >
            {[
              { k: "Pillars", v: "05" },
              { k: "Surfaces", v: "Web + App" },
              { k: "Setup", v: "< 5 min" },
              { k: "Spreadsheets", v: "Zero" },
            ].map((stat) => (
              <div key={stat.k}>
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  {stat.k}
                </dt>
                <dd className="mt-1.5 font-agrandir text-xl font-bold text-white tabular-nums">
                  {stat.v}
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </section>

      {/* ── Sticky pillar tab-bar + scroll progress ──────────────────── */}
      <div className="sticky top-0 z-30 border-y border-white/[0.07] bg-canvas/80 backdrop-blur-xl">
        <nav
          aria-label="Platform pillars"
          className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {FEATURES.map((f) => {
            const Icon = f.Icon;
            const isActive = active === f.id;
            return (
              <a
                key={f.id}
                href={`#${f.id}`}
                aria-current={isActive ? "true" : undefined}
                className="group relative flex flex-shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200"
              >
                <Icon
                  className={`h-4 w-4 transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                  weight="bold"
                  aria-hidden="true"
                />
                <span
                  className={`transition-colors duration-200 ${
                    isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                  }`}
                >
                  <span className="mr-1.5 tabular-nums text-xs text-slate-600">
                    {f.index}
                  </span>
                  {f.eyebrow}
                </span>
                {isActive && (
                  <motion.span
                    layoutId="pillar-underline"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </a>
            );
          })}
        </nav>
        <motion.div
          aria-hidden="true"
          className="h-0.5 origin-left bg-primary"
          style={{ scaleX: reduce ? 0 : progress }}
        />
      </div>

      {/* ── Feature chapters ─────────────────────────────────────────── */}
      <div ref={flowRef} className="relative">
        {FEATURES.map((feature, i) => {
          const { Icon, Visual } = feature;
          const flip = i % 2 === 1;
          return (
            <motion.section
              key={feature.id}
              id={feature.id}
              ref={(el) => {
                sectionRefs.current[feature.id] = el;
              }}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
              }}
              className="relative scroll-mt-20 border-b border-white/[0.06] py-20 md:py-28"
            >
              {/* Oversized index watermark, anchored to the chapter */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-6 top-10 select-none font-agrandir text-[7rem] font-bold leading-none text-white/[0.03] md:text-[10rem] lg:right-16"
              >
                {feature.index}
              </span>

              <div className="mx-auto max-w-6xl px-6">
                {/* Chapter header, full width, sits above the split */}
                <motion.div variants={fade} className="max-w-2xl">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" weight="bold" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-medium text-slate-400">
                      {feature.eyebrow}
                    </span>
                  </div>
                  <h2
                    className="mt-6 font-agrandir text-[clamp(1.9rem,4.4vw,3.25rem)] font-bold leading-[1.0] text-white [text-wrap:balance]"
                    style={{ letterSpacing: "-0.04em" }}
                  >
                    {feature.title}
                  </h2>
                  <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 md:text-lg">
                    {feature.lede}
                  </p>
                </motion.div>

                {/* Split: large visual panel + capability rail. Alternates side. */}
                <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-16">
                  {/* Visual, takes the wider column */}
                  <motion.div
                    variants={fade}
                    className={`flex justify-center lg:col-span-7 ${flip ? "lg:order-2" : "lg:order-1"}`}
                  >
                    <Visual />
                  </motion.div>

                  {/* Capability rail, stacked list with dividers, not cards */}
                  <div
                    className={`lg:col-span-5 ${flip ? "lg:order-1" : "lg:order-2"}`}
                  >
                    <motion.ul
                      variants={fade}
                      className="divide-y divide-white/[0.07]"
                    >
                      {feature.capabilities.map((cap) => (
                        <li key={cap.title} className="flex gap-3 py-3.5 first:pt-0">
                          <span
                            aria-hidden="true"
                            className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary"
                          >
                            <Check className="h-3 w-3" weight="bold" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {cap.title}
                            </p>
                            <p className="mt-0.5 text-[13px] leading-snug text-slate-400">
                              {cap.desc}
                            </p>
                          </div>
                        </li>
                      ))}
                    </motion.ul>

                    <motion.div
                      variants={fade}
                      className="mt-7 flex flex-wrap items-center gap-3"
                    >
                      <Link
                        href={feature.cta.href}
                        className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-black transition-colors duration-200 hover:bg-[#1f83ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        {feature.cta.label}
                        <ArrowRight
                          className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                          weight="bold"
                        />
                      </Link>
                      <div className="flex flex-wrap gap-2">
                        {feature.platforms.map((platform) => (
                          <span
                            key={platform}
                            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300"
                          >
                            {platform}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.section>
          );
        })}
      </div>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 py-24 md:py-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(52,145,255,0.1) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2"
          style={{
            background: "linear-gradient(90deg, transparent, #3491ff, transparent)",
          }}
        />
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: reduce ? 0 : 0.08 } },
          }}
          className="relative z-10 mx-auto max-w-3xl text-center"
        >
          <motion.h2
            variants={fade}
            className="font-agrandir text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.03] text-white [text-wrap:balance]"
            style={{ letterSpacing: "-0.035em" }}
          >
            Five pillars. One platform.{" "}
            <span className="text-primary">Zero spreadsheets.</span>
          </motion.h2>
          <motion.p
            variants={fade}
            className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-slate-300 md:text-lg"
          >
            Join the organisers already running their events on Unifesto, from
            the first poster to the final debrief.
          </motion.p>
          <motion.div
            variants={fade}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              href="/#host"
              className="w-full rounded-xl bg-primary px-7 py-3.5 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 sm:w-auto"
            >
              Start hosting events
            </Link>
            <Link
              href="/events"
              className="w-full rounded-xl border border-white/15 px-7 py-3.5 text-sm font-semibold text-white transition-colors duration-200 hover:border-primary/50 hover:text-primary sm:w-auto"
            >
              Explore events
            </Link>
          </motion.div>
        </motion.div>
      </section>
    </>
  );
}
