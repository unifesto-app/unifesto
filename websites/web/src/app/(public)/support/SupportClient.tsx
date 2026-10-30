"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  MagnifyingGlass,
  CaretDown,
  EnvelopeSimple,
  WhatsappLogo,
  FileText,
  ShieldCheck,
  Receipt,
  BookOpen,
} from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { SupportGroup, SupportRow, supportMailto, whatsappHref } from "@/components/support";
import { PLATFORM_FEE_STARTS_LABEL, SITE, buyerFeeText, planFeesText } from "@/lib/site";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Data ───────────────────────────────────────────────────────────── */
const faqs = [
  {
    id: "gs-1",
    category: "Getting Started",
    question: "What exactly is Unifesto?",
    answer:
      "Unifesto is the operating system for the people who run events at institutions, clubs, communities, and startups. It brings your team, ticketing, multi-point QR check-in, payouts and financials, certificates and the follow-up into one platform organised around Spaces, replacing the scattered mix of forms, spreadsheets, posters, and group chats.",
  },
  {
    id: "gs-2",
    category: "Getting Started",
    question: "How do I create an account?",
    answer:
      "Download the Unifesto app or sign in on the web with your email. Verification takes seconds, and you're matched to relevant events right away.",
  },
  {
    id: "gs-3",
    category: "Getting Started",
    question: "Where is Unifesto available?",
    answer:
      "We launched in Hyderabad and are expanding across India. If your organisation isn't live yet, join the waitlist and we'll onboard you next.",
  },
  {
    id: "st-1",
    category: "For Students",
    question: "How does check-in work?",
    answer:
      "Every registration mints a unique QR pass in your app. At the event, a Crew member scans it at any of the check-in points and you are in, in under a second. No paper lists, no queue.",
  },
  {
    id: "st-2",
    category: "For Students",
    question: "Where do my tickets and passes live?",
    answer:
      "Everything sits in your Unifesto wallet: event passes, QR codes, and certificates in one place, available offline once loaded.",
  },
  {
    id: "st-3",
    category: "For Students",
    question: "Can I register for events in one tap?",
    answer:
      "Yes. Matched events show a single register action; most attendees are in under a minute, with a confirmation sent straight to WhatsApp.",
  },
  {
    id: "or-1",
    category: "For Organizers",
    question: "How do I publish an event?",
    answer:
      "Create the event in the organiser dashboard, set registration fields, and publish. It's discoverable to matched attendees immediately, and you manage everything from one screen.",
  },
  {
    id: "or-2",
    category: "For Organizers",
    question: "What is the post-event debrief?",
    answer:
      "After your event, Unifesto generates a formatted report with real data: registrations, attendance by check-in point, and the financial roll-up, so you plan the next one on evidence, not guesses.",
  },
  {
    id: "or-3",
    category: "For Organizers",
    question: "Can my whole team manage one event?",
    answer:
      "Yes. Add volunteers and leads with roles so your team runs registration and check-in together, without stitching spreadsheets and group chats.",
  },
  {
    id: "ft-1",
    category: "Features",
    question: "Does Unifesto work over WhatsApp?",
    answer:
      "WhatsApp is first-class. Confirmations, reminders, and updates reach attendees where they already are, with no separate inbox to check.",
  },
  {
    id: "ft-2",
    category: "Features",
    question: "Can I use Unifesto offline?",
    answer:
      "Passes and QR codes in your wallet load once and work offline, useful on crowded venue networks and slower connections.",
  },
  {
    id: "pr-1",
    category: "Pricing & Billing",
    question: "Is Unifesto free for students?",
    answer:
      `Yes, discovery, registration, and your passes are free for attendees. A paid ticket carries a ${buyerFeeText()}, unless the organiser includes it in the price. You see the total before you pay.`,
  },
  {
    id: "pr-2",
    category: "Pricing & Billing",
    question: "How does billing work for organisers?",
    answer:
      `Free RSVP events cost nothing. From ${PLATFORM_FEE_STARTS_LABEL}, organisers pay a platform fee per paid ticket by plan: ${planFeesText()}. Razorpay's charges come out of the buyer's processing fee, so you never pay them on top. See Pricing for plans.`,
  },
  {
    id: "vf-1",
    category: "Verification",
    question: "How do I verify a certificate?",
    answer:
      "Every certificate issued through Unifesto carries a verifiable ID. Use the /verify page to confirm a certificate, employee ID, or space credential instantly.",
  },
  {
    id: "vf-2",
    category: "Verification",
    question: "Is my personal data safe?",
    answer:
      "Your personal data is used only to run the events you register for and is handled per our privacy policy. You stay in control of your credentials.",
  },
];

const categories = ["All", ...Array.from(new Set(faqs.map((f) => f.category)))];

/* Mirrors the mobile Support screen: real channels in grouped rows, then
   answers, then legal. No simulated chat or tickets. */
/** hasHelp: K17, the help-articles link shows only once an article is published. */
export default function SupportClient({ hasHelp }: { hasHelp: boolean }) {
  const reduce = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [faqCategory, setFaqCategory] = useState("All");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const filteredFaqs = faqs.filter(
    (f) =>
      (faqCategory === "All" || f.category === faqCategory) &&
      (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)),
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />

      <div className="mx-auto max-w-2xl px-4 pb-24 pt-32 sm:px-6 md:pt-40">
        <h1
          className="font-display text-[clamp(2.25rem,5.4vw,3.5rem)] font-bold leading-[1.05] text-paper"
          style={{ letterSpacing: "-0.035em" }}
        >
          How can we help?
        </h1>
        <p className="mt-3 text-base text-paper/70">Reach the Unifesto team directly. We reply within 24 hours.</p>

        <SupportGroup title="Contact">
          <SupportRow
            icon={<EnvelopeSimple weight="fill" className="h-7 w-7 text-primary" />}
            label="Email"
            value={SITE.email}
            href={`mailto:${SITE.email}`}
            onClickHref={supportMailto}
          />
          <SupportRow
            icon={<WhatsappLogo weight="fill" className="h-7 w-7 text-[#25D366]" />}
            label="WhatsApp"
            value={SITE.whatsappDisplay}
            href={whatsappHref}
          />
        </SupportGroup>

        {hasHelp && (
          <SupportGroup title="Help articles">
            <SupportRow
              icon={<BookOpen className="h-7 w-7 text-paper/60" />}
              label="Browse help articles"
              value="Step-by-step answers for attendees and organisers"
              href="/help"
            />
          </SupportGroup>
        )}

        <section className="mt-8">
          <h2 className="mb-2 px-1 text-sm font-medium text-paper/55">Common questions</h2>
          <div className="relative">
            <MagnifyingGlass
              weight="bold"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-paper/55"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for help…"
              aria-label="Search FAQs"
              className="w-full rounded-lg bg-night-2 py-3.5 pl-12 pr-4 text-sm text-paper placeholder:text-paper/45 outline-none transition-colors duration-150 focus:bg-night-3"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map((category) => {
              const active = faqCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setFaqCategory(category)}
                  aria-pressed={active}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                    active ? "bg-primary text-primary-foreground" : "bg-night-2 text-paper/75 hover:bg-night-3 hover:text-paper"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="mt-3 divide-y divide-white/[0.06] overflow-hidden rounded-2xl bg-night-2">
            {filteredFaqs.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-paper/70">
                No results for “{search}”. Email or WhatsApp us and we will sort it out.
              </p>
            ) : (
              filteredFaqs.map((faq) => {
                const open = openFaq === faq.id;
                return (
                  <div key={faq.id}>
                    <button
                      onClick={() => setOpenFaq(open ? null : faq.id)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition-colors duration-150 hover:bg-night-3"
                    >
                      <span className="text-[15px] font-medium text-paper">{faq.question}</span>
                      <CaretDown
                        weight="bold"
                        className={`h-4 w-4 flex-shrink-0 text-paper/55 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={reduce ? undefined : { height: 0, opacity: 0 }}
                          animate={reduce ? undefined : { height: "auto", opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <p className="px-4 pb-4 text-sm leading-relaxed text-paper/70">{faq.answer}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <SupportGroup title="Legal">
          <SupportRow icon={<FileText className="h-7 w-7 text-paper/60" />} label="Terms of service" href="/terms" />
          <SupportRow icon={<ShieldCheck className="h-7 w-7 text-paper/60" />} label="Privacy policy" href="/privacy" />
          <SupportRow icon={<Receipt className="h-7 w-7 text-paper/60" />} label="Refund policy" href="/refund" />
        </SupportGroup>
      </div>

      <Footer />
    </main>
  );
}
