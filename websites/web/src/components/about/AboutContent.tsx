"use client";

import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "motion/react";
import {
  ArrowRight,
  Lightning,
  Compass,
  DeviceMobile,
  Sparkle,
  Quotes,
} from "@phosphor-icons/react";

const ease = [0.22, 1, 0.36, 1] as const;

/* ── Shared reveal ─────────────────────────────────────────────────── */
function useFade(reduce: boolean | null): Variants {
  return {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 22, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: reduce ? 0 : 0.6, ease },
    },
  };
}

/* ── Content ───────────────────────────────────────────────────────── */
const STATS = [
  { k: "First community", v: "MRU" },
  { k: "Attendees reached", v: "10K+" },
  { k: "Check-in rate", v: "93%" },
  { k: "Spreadsheets", v: "Zero" },
];

const BELIEFS = [
  {
    Icon: Sparkle,
    title: "Say only what the product does.",
    body: "We do not ship fake magic. QR passes that scan at the door, financials that reconcile to the rupee, certificates that verify. Depth we can point at, not a badge we stick on a hero.",
  },
  {
    Icon: Compass,
    title: "Proof over hype.",
    body: "Every bold line earns its place with a real number or a named organisation. We'd rather say 93% check-in at Malla Reddy than \"trusted by thousands.\"",
  },
  {
    Icon: DeviceMobile,
    title: "Mobile-first, WhatsApp-native.",
    body: "The real user is on a phone between classes. We design the small screen first; the desktop site is the shopfront, the phone is where the job gets done.",
  },
  {
    Icon: Lightning,
    title: "Fast and high-contrast.",
    body: "Momentum is a feeling. Snappy motion, decisive contrast, no dead weight. The interface should feel as quick as the platform claims to be.",
  },
];

const VOICES = [
  {
    quote:
      "We managed 300+ registrations for Hack League without a single spreadsheet. The QR check-in was flawless.",
    name: "Arjun Sharma",
    role: "Lead Organiser · GDG on Campus, MRU",
  },
  {
    quote:
      "I found out about ESummit through Unifesto and registered in one tap. This is how events should work.",
    name: "Priya Reddy",
    role: "Final Year, CSE · MRU",
  },
  {
    quote:
      "The debrief after WDS 2026 was incredible. We knew exactly how many people showed up to each committee.",
    name: "Neha Kaushal",
    role: "Secretary General, MUN Club · MRU",
  },
];

export default function AboutContent() {
  const reduce = useReducedMotion();
  const fade = useFade(reduce);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  const glowY = useTransform(progress, [0, 1], ["0%", "18%"]);

  return (
    <>
      {/* top scroll-progress line */}
      <motion.div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-primary"
        style={{ scaleX: reduce ? 0 : progress }}
      />

      {/* ── Hero: the story opener ─────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pt-36 pb-20 md:pb-28">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            y: reduce ? 0 : glowY,
            background:
              "radial-gradient(58rem 34rem at 72% 4%, rgba(52,145,255,0.16), transparent 60%)",
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
              Built by struggled event organisers
            </span>
          </motion.div>

          <motion.h1
            variants={fade}
            className="mt-6 max-w-4xl font-agrandir text-[clamp(2.5rem,6.6vw,5rem)] font-bold leading-[0.98] text-white [text-wrap:balance]"
            style={{ letterSpacing: "-0.045em" }}
          >
            Great events were happening.{" "}
            <span className="text-primary">People kept missing them.</span>
          </motion.h1>

          <motion.p
            variants={fade}
            className="mt-7 max-w-2xl text-base leading-relaxed text-slate-300 md:text-lg"
          >
            Unifesto started with one frustration in Hyderabad: the best fests,
            workshops and club nights lived in torn-down posters and a dozen
            WhatsApp groups, and nobody found them in time. We&apos;re the AI
            brain that pulls all of it into one place, one community at a time.
          </motion.p>

          <motion.div variants={fade} className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-black transition-colors duration-300 hover:bg-[#1f83ff]"
            >
              View pricing
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                weight="bold"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors duration-300 hover:border-white/25 hover:text-white"
            >
              Explore events
            </Link>
          </motion.div>

          <motion.dl
            variants={fade}
            className="mt-14 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 border-t border-white/[0.08] pt-8 sm:grid-cols-4"
          >
            {STATS.map((s) => (
              <div key={s.k}>
                <dt className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  {s.k}
                </dt>
                <dd className="mt-1.5 font-agrandir text-2xl font-bold text-white tabular-nums">
                  {s.v}
                </dd>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </section>

      {/* ── The origin: broken → fixed, editorial two-column ───────── */}
      <section className="relative border-t border-white/[0.06] px-6 py-20 md:py-28">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.1 } } }}
          className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-20"
        >
          <motion.div variants={fade} className="lg:col-span-5">
            <h2
              className="font-agrandir text-[clamp(1.9rem,4.4vw,3.25rem)] font-bold leading-[1.02] text-white [text-wrap:balance]"
              style={{ letterSpacing: "-0.04em" }}
            >
              Events ran on chaos.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
              Forms in one tab, a spreadsheet of RSVPs in another, a group chat
              on fire, and a volunteer at the gate ticking names off a printout.
              Organisers burned out. People missed the events they&apos;d have
              loved. We lived it, so we rebuilt the whole thing.
            </p>
          </motion.div>

          <motion.div variants={fade} className="lg:col-span-7">
            <ul className="divide-y divide-white/[0.08]">
              {[
                {
                  before: "Announced in a dozen WhatsApp groups",
                  after: "One personalised feed, ranked by what fits you",
                },
                {
                  before: "RSVPs lost across spreadsheets",
                  after: "A live organiser dashboard that never drifts",
                },
                {
                  before: "Manual, slow, fraud-prone check-in",
                  after: "QR check-in that scans in under half a second",
                },
                {
                  before: "No idea who actually showed up",
                  after: "A full debrief the moment the event ends",
                },
              ].map((row) => (
                <li
                  key={row.before}
                  className="grid gap-2 py-5 first:pt-0 sm:grid-cols-2 sm:gap-8"
                >
                  <p className="text-[15px] leading-snug text-slate-500 line-through decoration-slate-700">
                    {row.before}
                  </p>
                  <p className="text-[15px] font-medium leading-snug text-white">
                    <span className="text-primary" aria-hidden="true">
                      →{" "}
                    </span>
                    {row.after}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      </section>

      {/* ── What we believe: divider rail, not card grid ───────────── */}
      <section className="relative border-t border-white/[0.06] px-6 py-20 md:py-28">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-6 top-12 select-none font-agrandir text-[7rem] font-bold leading-none text-white/[0.03] md:text-[10rem] lg:right-16"
        >
          01
        </span>
        <div className="mx-auto max-w-6xl">
          <motion.h2
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: reduce ? 0 : 0.6, ease }}
            className="max-w-2xl font-agrandir text-[clamp(1.9rem,4.4vw,3.25rem)] font-bold leading-[1.02] text-white [text-wrap:balance]"
            style={{ letterSpacing: "-0.04em" }}
          >
            What we believe about event software.
          </motion.h2>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.09 } } }}
            className="mt-14 grid gap-x-16 gap-y-10 md:grid-cols-2"
          >
            {BELIEFS.map((b) => {
              const Icon = b.Icon;
              return (
                <motion.div
                  key={b.title}
                  variants={fade}
                  className="flex gap-5 border-t border-white/[0.08] pt-7"
                >
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" weight="bold" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-agrandir text-lg font-bold leading-snug text-white">
                      {b.title}
                    </h3>
                    <p className="mt-2.5 text-[15px] leading-relaxed text-slate-400">
                      {b.body}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Proof: voices from the first community ──────────────────── */}
      <section className="relative border-t border-white/[0.06] px-6 py-20 md:py-28">
        <div className="mx-auto max-w-6xl">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: reduce ? 0 : 0.6, ease }}
            className="max-w-2xl"
          >
            <h2
              className="font-agrandir text-[clamp(1.9rem,4.4vw,3.25rem)] font-bold leading-[1.02] text-white [text-wrap:balance]"
              style={{ letterSpacing: "-0.04em" }}
            >
              The first community is already sold.
            </h2>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300">
              Unifesto launched at Malla Reddy University in Hyderabad. Here&apos;s
              what the organisers and attendees who ran it on real events had to
              say.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.1 } } }}
            className="mt-14 grid gap-8 md:grid-cols-3"
          >
            {VOICES.map((v) => (
              <motion.figure
                key={v.name}
                variants={fade}
                className="flex flex-col border-t-2 border-primary/40 pt-6"
              >
                <Quotes
                  className="h-6 w-6 text-primary"
                  weight="fill"
                  aria-hidden="true"
                />
                <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-slate-200">
                  {v.quote}
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                  >
                    {v.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      {v.name}
                    </span>
                    <span className="block text-xs text-slate-500">{v.role}</span>
                  </span>
                </figcaption>
              </motion.figure>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Where we're headed + CTA ───────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-white/[0.06] px-6 py-24 md:py-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(46rem 26rem at 50% 120%, rgba(52,145,255,0.14), transparent 60%)",
          }}
        />
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24, filter: "blur(4px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: reduce ? 0 : 0.7, ease }}
          className="relative z-10 mx-auto max-w-3xl text-center"
        >
          <p className="text-sm font-medium text-primary">Where we&apos;re headed</p>
          <h2
            className="mt-4 font-agrandir text-[clamp(2rem,5vw,3.75rem)] font-bold leading-[1.0] text-white [text-wrap:balance]"
            style={{ letterSpacing: "-0.045em" }}
          >
            One community at a time, until every event runs on Unifesto.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-300">
            Each new community onboards because the last one made it look
            effortless. If yours is next, we&apos;d love to build it with you.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/pricing"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-black transition-colors duration-300 hover:bg-[#1f83ff]"
            >
              View pricing
              <ArrowRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                weight="bold"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/#host"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-7 py-3 text-sm font-semibold text-slate-300 transition-colors duration-300 hover:border-white/25 hover:text-white"
            >
              Bring Unifesto to your community
            </Link>
          </div>
        </motion.div>
      </section>
    </>
  );
}
