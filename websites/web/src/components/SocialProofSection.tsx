"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

/* Supporting proof, stated as facts inline \u2014 not four identical big-number
   cards. One dominant living figure carries the weight; the rest read as
   evidence in a sentence. */
const proof = [
  { value: "25+", label: "events run end-to-end" },
  { value: "10+", label: "clubs & societies onboard" },
  { value: "0", label: "printed tickets, ever" },
];

function useCountUp(target: number, duration: number, active: boolean, reduce: boolean) {
  const [count, setCount] = useState(reduce ? target : 0);
  useEffect(() => {
    if (!active || reduce) {
      setCount(target);
      return;
    }
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [active, target, duration, reduce]);
  return count;
}

export default function SocialProofSection() {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const reduce = !!useReducedMotion();
  const students = useCountUp(10000, 1800, active, reduce);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActive(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="social-proof"
      aria-labelledby="proof-heading"
      className="relative overflow-hidden bg-canvas px-6 py-24 md:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(46rem 30rem at 78% 40%, rgba(52,145,255,0.09), transparent 62%)",
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-5xl items-center gap-14 md:grid-cols-[1.1fr_0.9fr] md:gap-20">
        {/* Left: the dominant, living figure + narrative. */}
        <div>
          <p className="text-sm font-medium text-primary">
            Malla Reddy University runs on it
          </p>
          <div className="mt-4 flex items-baseline gap-3">
            <span
              className="font-agrandir text-[clamp(3.5rem,9vw,6rem)] font-bold leading-none text-white"
              style={{ letterSpacing: "-0.05em" }}
            >
              {students.toLocaleString()}
              <span className="text-primary">+</span>
            </span>
          </div>
          <p className="mt-3 max-w-md text-lg leading-relaxed text-slate-300">
            attendees discover, register and check into events through
            Unifesto, without a single form printed or a queue at the gate.
          </p>

          {/* Evidence line \u2014 inline, not carded. */}
          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-6">
            {proof.map((p, i) => (
              <motion.div
                key={p.label}
                initial={reduce ? false : { opacity: 0, y: 12 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease }}
              >
                <dt className="text-3xl font-bold text-white">{p.value}</dt>
                <dd className="mt-0.5 max-w-[9rem] text-sm text-slate-400">
                  {p.label}
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>

        {/* Right: a real voice, not a testimonial slider. */}
        <motion.figure
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.6, ease }}
          className="relative rounded-3xl border border-white/10 bg-white/[0.03] p-8"
        >
          <span
            aria-hidden="true"
            className="font-agrandir absolute -top-4 left-6 text-6xl leading-none text-primary/30"
          >
            &ldquo;
          </span>
          <blockquote
            id="proof-heading"
            className="relative text-xl font-medium leading-snug text-white md:text-2xl"
          >
            We check in 2,000 people at the gate in minutes now. Last year that
            was three volunteers and a spreadsheet.
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
              IE
            </span>
            <span className="text-sm">
              <span className="block font-semibold text-white">
                I&amp;E Cell, MRUH
              </span>
              <span className="block text-slate-400">Event operations lead</span>
            </span>
          </figcaption>
        </motion.figure>
      </div>
    </section>
  );
}
