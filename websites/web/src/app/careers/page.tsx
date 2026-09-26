"use client";

import { useEffect, useState, type FormEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  MapPin,
  Briefcase,
  Clock,
  ChartBar,
  X,
  ArrowRight,
  CaretRight,
  CurrencyInr,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface Career {
  id: string;
  title: string;
  department: string;
  location: string;
  type: string;
  experience_level: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  benefits: string[];
  salary_range?: string;
  status: string;
  created_at: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

const EASE = [0.22, 1, 0.36, 1] as const;

const CTA =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-[#050507] transition-colors duration-200 hover:bg-[#1f83ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const SELECT =
  "rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-slate-100 outline-none transition-colors duration-200 focus:border-primary [&>option]:bg-[#0a0a0d]";

export default function CareersPage() {
  const reduce = useReducedMotion();
  const [careers, setCareers] = useState<Career[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCareer, setSelectedCareer] = useState<Career | null>(null);
  const [applyFor, setApplyFor] = useState<Career | null>(null);
  const [filter, setFilter] = useState({ department: "", type: "" });

  useEffect(() => {
    const loadCareers = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filter.department) params.append("department", filter.department);
        if (filter.type) params.append("type", filter.type);

        const res = await fetch(`${API_BASE}/careers?${params}`);
        const json = await res.json();
        setCareers(json.data || []);
      } catch (error) {
        console.error("Failed to load careers:", error);
      } finally {
        setLoading(false);
      }
    };
    loadCareers();
  }, [filter]);

  const departments = [...new Set(careers.map((c) => c.department))];
  const types = [...new Set(careers.map((c) => c.type))];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050507] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative px-6 pt-36 pb-12">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            We&apos;re hiring across the team
          </span>
          <h1 className="mt-6 text-balance text-4xl font-bold tracking-[-0.03em] sm:text-5xl md:text-6xl">
            Build the <span className="text-primary">events</span> everyone shows up for.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-slate-300 md:text-lg">
            We&apos;re a small, product-obsessed team turning scattered events into one place institutions, clubs, communities, and startups trust. Come help us get there.
          </p>
        </div>
      </section>

      {/* Filters + list */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filter.department}
              onChange={(e) => setFilter({ ...filter, department: e.target.value })}
              aria-label="Filter by department"
              className={SELECT}
            >
              <option value="">All departments</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
            <select
              value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}
              aria-label="Filter by employment type"
              className={SELECT}
            >
              <option value="">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {careers.length > 0 && (
              <span className="ml-auto text-sm text-slate-400">
                {careers.length} open {careers.length === 1 ? "role" : "roles"}
              </span>
            )}
          </div>

          <div className="mt-8">
            {loading ? (
              <div className="flex flex-col items-center py-24 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="mt-4 text-sm text-slate-400">Loading opportunities…</p>
              </div>
            ) : careers.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-20 text-center">
                <p className="text-lg font-medium text-slate-200">No open positions right now</p>
                <p className="mt-2 text-sm text-slate-400">
                  Check back soon, or email us at{" "}
                  <a href="mailto:careers@unifesto.app" className="text-primary hover:underline">
                    careers@unifesto.app
                  </a>
                  .
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {careers.map((career, i) => (
                  <motion.li
                    key={career.id}
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}
                  >
                    <button
                      onClick={() => setSelectedCareer(career)}
                      className="group flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="text-lg font-semibold text-white">{career.title}</h3>
                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={16} weight="bold" className="text-slate-400" />
                            {career.location}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Briefcase size={16} weight="bold" className="text-slate-400" />
                            {career.department}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock size={16} weight="bold" className="text-slate-400" />
                            {career.type}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <ChartBar size={16} weight="bold" className="text-slate-400" />
                            {career.experience_level}
                          </span>
                        </div>
                      </div>
                      <CaretRight
                        size={20}
                        weight="bold"
                        className="shrink-0 text-slate-500 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary"
                      />
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedCareer && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedCareer(null)}
          >
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-hidden />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedCareer.title} details`}
              initial={reduce ? false : { opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 12 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0d] p-6 sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
                    {selectedCareer.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin size={16} weight="bold" className="text-slate-400" />
                      {selectedCareer.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase size={16} weight="bold" className="text-slate-400" />
                      {selectedCareer.department}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock size={16} weight="bold" className="text-slate-400" />
                      {selectedCareer.type}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ChartBar size={16} weight="bold" className="text-slate-400" />
                      {selectedCareer.experience_level}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCareer(null)}
                  aria-label="Close"
                  className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <X size={20} weight="bold" />
                </button>
              </div>

              {selectedCareer.salary_range && (
                <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                    <CurrencyInr size={18} weight="bold" />
                  </span>
                  <div>
                    <p className="text-xs text-slate-400">Compensation</p>
                    <p className="text-base font-semibold text-white">{selectedCareer.salary_range}</p>
                  </div>
                </div>
              )}

              <div className="mt-6 space-y-7">
                <div>
                  <h3 className="text-base font-semibold text-white">About the role</h3>
                  <p className="mt-2 leading-relaxed text-slate-300">{selectedCareer.description}</p>
                </div>

                {selectedCareer.responsibilities.length > 0 && (
                  <DetailList title="What you’ll do" items={selectedCareer.responsibilities} />
                )}
                {selectedCareer.requirements.length > 0 && (
                  <DetailList title="What we’re looking for" items={selectedCareer.requirements} />
                )}
                {selectedCareer.benefits.length > 0 && (
                  <DetailList title="What you’ll get" items={selectedCareer.benefits} />
                )}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => setApplyFor(selectedCareer)}
                  className={`${CTA} flex-1`}
                >
                  Apply now
                  <ArrowRight size={16} weight="bold" />
                </button>
                <button
                  onClick={() => setSelectedCareer(null)}
                  className="rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:border-white/20 hover:text-white"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {applyFor && (
        <ApplyModal career={applyFor} onClose={() => setApplyFor(null)} />
      )}

      <Footer />
    </main>
  );
}

const FIELD =
  "w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-primary/50 focus:outline-none";

function ApplyModal({
  career,
  onClose,
}: {
  career: Career;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    coverLetter: "",
    linkedinUrl: "",
    portfolioUrl: "",
  });
  const [resume, setResume] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resume) {
      setError("Please attach your resume.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("fullName", form.fullName);
      fd.append("email", form.email);
      if (form.phone) fd.append("phone", form.phone);
      if (form.coverLetter) fd.append("coverLetter", form.coverLetter);
      if (form.linkedinUrl) fd.append("linkedinUrl", form.linkedinUrl);
      if (form.portfolioUrl) fd.append("portfolioUrl", form.portfolioUrl);
      fd.append("resume", resume);

      const res = await fetch(`${API_BASE}/careers/${career.id}/apply`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Could not submit your application.");
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0f] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">
              {done ? "Application received" : "Apply"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">{career.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {done ? (
          <div className="mt-6 text-center">
            <p className="text-slate-300">
              Thanks for applying to <strong>{career.title}</strong>. We&apos;ve
              received your application and will be in touch if it&apos;s a match.
            </p>
            <button onClick={onClose} className={`${CTA} mt-6`}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <input
              required
              value={form.fullName}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="Full name"
              className={FIELD}
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Email"
              className={FIELD}
            />
            <input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="Phone (optional)"
              className={FIELD}
            />

            <div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-sm hover:border-white/25">
                <span className={resume ? "text-white" : "text-slate-400"}>
                  {resume ? resume.name : "Attach resume (PDF or Word, ≤5MB)"}
                </span>
                <span className="shrink-0 rounded-lg bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                  {resume ? "Replace" : "Choose file"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => setResume(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <textarea
              rows={4}
              value={form.coverLetter}
              onChange={(e) => set("coverLetter", e.target.value)}
              placeholder="Cover letter (optional)"
              className={FIELD}
            />
            <input
              value={form.linkedinUrl}
              onChange={(e) => set("linkedinUrl", e.target.value)}
              placeholder="LinkedIn URL (optional)"
              className={FIELD}
            />
            <input
              value={form.portfolioUrl}
              onChange={(e) => set("portfolioUrl", e.target.value)}
              placeholder="Portfolio / GitHub URL (optional)"
              className={FIELD}
            />

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className={`${CTA} w-full ${submitting ? "opacity-60" : ""}`}
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item, idx) => (
          <li key={idx} className="flex gap-2.5 leading-relaxed text-slate-300">
            <CaretRight size={16} weight="bold" className="mt-1 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
