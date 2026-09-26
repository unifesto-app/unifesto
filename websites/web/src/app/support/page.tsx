"use client";

import { useState } from "react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  MagnifyingGlass,
  CaretDown,
  CaretRight,
  ArrowLeft,
  Plus,
  X,
  EnvelopeSimple,
  ChatCircleDots,
  Compass,
  XLogo,
  Check,
  Ticket as TicketIcon,
  PaperPlaneRight,
  ArrowUpRight,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Reveal ─────────────────────────────────────────────────────────── */
function useFade(reduce: boolean | null): Variants {
  return {
    hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 20, filter: "blur(4px)" },
    show: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: reduce ? 0 : 0.55, ease: EASE },
    },
  };
}

/* ── Types ──────────────────────────────────────────────────────────── */
type TabId = "faq" | "tickets" | "contact";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: "open" | "in-progress" | "resolved" | "closed";
  priority: "low" | "medium" | "high";
  createdAt: string;
  lastUpdated: string;
  messages: {
    id: string;
    sender: "user" | "support";
    message: string;
    timestamp: string;
  }[];
}

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
      "Yes, discovery, registration, and your wallet are free for attendees. You only pay if an individual event charges a ticket fee.",
  },
  {
    id: "pr-2",
    category: "Pricing & Billing",
    question: "How does billing work for organisers?",
    answer:
      "Organisers can host free events at no cost. Paid tooling and payment collection are billed transparently per event. Reach out and we'll walk your team through it.",
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

const contactOptions = [
  {
    Icon: EnvelopeSimple,
    title: "Email Support",
    description: "Reach the team directly. We reply within 24 hours.",
    action: "support@unifesto.app",
    href: "mailto:support@unifesto.app",
  },
  {
    Icon: ChatCircleDots,
    title: "Live Chat",
    description: "Chat with support during working hours, IST.",
    action: "Start a chat",
    href: "#chat",
  },
  {
    Icon: Compass,
    title: "Help Center",
    description: "Browse guides for attendees and organisers.",
    action: "Open guides",
    href: "#help-center",
  },
  {
    Icon: XLogo,
    title: "Twitter / X",
    description: "Follow launches and reach us in public.",
    action: "@unifestoapp",
    href: "https://x.com/unifestoapp",
  },
];

const resources = [
  {
    href: "/about",
    title: "About Unifesto",
    body: "Our mission and how we're rebuilding events in India.",
  },
  {
    href: "/features",
    title: "Platform Features",
    body: "Team and roles, ticketing, QR check-in, payouts, certificates and more.",
  },
  {
    href: "/verify",
    title: "Verification",
    body: "Confirm certificates, employee IDs, and space credentials.",
  },
];

/* ── Status / priority styling (color + label, never color alone) ────── */
function statusStyle(status: Ticket["status"]) {
  switch (status) {
    case "open":
      return "border-sky-400/30 bg-sky-400/10 text-sky-200";
    case "in-progress":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    case "resolved":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "closed":
      return "border-white/15 bg-white/5 text-slate-300";
  }
}

function priorityStyle(priority: Ticket["priority"]) {
  switch (priority) {
    case "high":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    case "medium":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    case "low":
      return "border-white/15 bg-white/5 text-slate-300";
  }
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

const TABS: { id: TabId; label: string }[] = [
  { id: "faq", label: "FAQ" },
  { id: "tickets", label: "Support tickets" },
  { id: "contact", label: "Contact us" },
];

/* ── Shared surface classes ─────────────────────────────────────────── */
const CARD =
  "rounded-2xl border border-white/10 bg-white/[0.03] transition-colors duration-200";
const CTA =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-[#050507] transition-colors duration-200 hover:bg-[#1f83ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const FIELD =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-colors duration-200 hover:border-white/20 focus:border-primary";

export default function SupportPage() {
  const reduce = useReducedMotion();
  const fade = useFade(reduce);

  const [activeTab, setActiveTab] = useState<TabId>("faq");
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [faqCategory, setFaqCategory] = useState<string>("All");
  const [search, setSearch] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    category: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketForm, setTicketForm] = useState({
    subject: "",
    category: "",
    priority: "medium" as "low" | "medium" | "high",
    description: "",
  });
  const [newMessage, setNewMessage] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([
    {
      id: "TKT-001",
      subject: "QR code not scanning at check-in",
      category: "technical",
      status: "in-progress",
      priority: "high",
      createdAt: "2026-01-08T09:24:00",
      lastUpdated: "2026-01-09T14:10:00",
      messages: [
        {
          id: "m1",
          sender: "user",
          message:
            "My event QR code won't scan at the gate and the camera just spins. Event is tomorrow, help!",
          timestamp: "2026-01-08T09:24:00",
        },
        {
          id: "m2",
          sender: "support",
          message:
            "Thanks for flagging this. Please update to the latest app version and reload your wallet, which regenerates the QR. We're also checking the venue scanner config on our side.",
          timestamp: "2026-01-09T14:10:00",
        },
      ],
    },
    {
      id: "TKT-002",
      subject: "Refund for a cancelled workshop",
      category: "billing",
      status: "resolved",
      priority: "medium",
      createdAt: "2026-01-02T16:40:00",
      lastUpdated: "2026-01-04T11:05:00",
      messages: [
        {
          id: "m1",
          sender: "user",
          message: "The workshop I paid for was cancelled. How do I get my refund?",
          timestamp: "2026-01-02T16:40:00",
        },
        {
          id: "m2",
          sender: "support",
          message:
            "Sorry about the cancellation. Your refund has been processed and should reach your original payment method within 5 to 7 business days.",
          timestamp: "2026-01-04T11:05:00",
        },
      ],
    },
  ]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormData({ name: "", email: "", category: "", message: "" });
    setTimeout(() => setSubmitted(false), 5000);
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date().toISOString();
    const ticket: Ticket = {
      id: `TKT-${String(tickets.length + 1).padStart(3, "0")}`,
      subject: ticketForm.subject,
      category: ticketForm.category,
      status: "open",
      priority: ticketForm.priority,
      createdAt: now,
      lastUpdated: now,
      messages: [
        {
          id: "m1",
          sender: "user",
          message: ticketForm.description,
          timestamp: now,
        },
      ],
    };
    setTickets([ticket, ...tickets]);
    setShowTicketForm(false);
    setTicketForm({ subject: "", category: "", priority: "medium", description: "" });
    setSelectedTicket(ticket);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newMessage.trim()) return;
    const now = new Date().toISOString();
    const updated: Ticket = {
      ...selectedTicket,
      lastUpdated: now,
      messages: [
        ...selectedTicket.messages,
        { id: `m${selectedTicket.messages.length + 1}`, sender: "user", message: newMessage, timestamp: now },
      ],
    };
    setTickets(tickets.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTicket(updated);
    setNewMessage("");
  };

  const filteredFaqs = faqs.filter((f) => {
    const inCategory = faqCategory === "All" || f.category === faqCategory;
    const q = search.trim().toLowerCase();
    const inSearch =
      !q ||
      f.question.toLowerCase().includes(q) ||
      f.answer.toLowerCase().includes(q);
    return inCategory && inSearch;
  });

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050507]">
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 pt-36 pb-14">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]"
        />
        <motion.div
          variants={fade}
          initial="hidden"
          animate="show"
          className="relative mx-auto max-w-3xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Support team online · replies within 24h
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
            How can we <span className="text-primary">help</span>?
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300">
            Answers for attendees and organisers running events on Unifesto.
            Search the FAQ, track a ticket, or reach a real person.
          </p>
        </motion.div>

        {/* Segmented tab control */}
        <motion.div
          variants={fade}
          initial="hidden"
          animate="show"
          className="relative mx-auto mt-10 flex max-w-md items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={active}
                className={`relative flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-200 ${
                  active ? "text-[#050507]" : "text-slate-300 hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="support-tab"
                    transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </motion.div>

        {/* FAQ search, only on the FAQ tab */}
        {activeTab === "faq" && (
          <motion.div
            variants={fade}
            initial="hidden"
            animate="show"
            className="relative mx-auto mt-6 max-w-xl"
          >
            <MagnifyingGlass
              weight="bold"
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for help…"
              aria-label="Search FAQs"
              className="w-full rounded-full border border-white/10 bg-white/[0.04] py-4 pl-12 pr-6 text-sm text-white placeholder-slate-400 outline-none transition-colors duration-200 hover:border-white/20 focus:border-primary"
            />
          </motion.div>
        )}
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      {activeTab === "faq" && (
        <section className="relative border-t border-white/5 px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <div className="mb-8 flex flex-wrap justify-center gap-2">
              {categories.map((category) => {
                const active = faqCategory === category;
                return (
                  <button
                    key={category}
                    onClick={() => setFaqCategory(category)}
                    className={`rounded-full border px-4 py-2 text-xs font-semibold transition-colors duration-200 ${
                      active
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              {filteredFaqs.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-300">
                  No results for “{search}”. Try a different search or reach us on the
                  Contact tab.
                </p>
              ) : (
                filteredFaqs.map((faq) => {
                  const open = openFaq === faq.id;
                  return (
                    <div key={faq.id} className={`overflow-hidden ${CARD}`}>
                      <button
                        onClick={() => setOpenFaq(open ? null : faq.id)}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-4 p-5 text-left"
                      >
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-primary">
                            {faq.category}
                          </span>
                          <h3 className="mt-1 text-sm font-semibold text-white md:text-base">
                            {faq.question}
                          </h3>
                        </div>
                        <CaretDown
                          weight="bold"
                          className={`h-5 w-5 flex-shrink-0 text-slate-300 transition-transform duration-200 ${
                            open ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            initial={reduce ? undefined : { height: 0, opacity: 0 }}
                            animate={reduce ? undefined : { height: "auto", opacity: 1 }}
                            exit={reduce ? undefined : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: EASE }}
                          >
                            <p className="px-5 pb-5 text-sm leading-relaxed text-slate-300">
                              {faq.answer}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Tickets ───────────────────────────────────────────────────── */}
      {activeTab === "tickets" && (
        <section className="relative border-t border-white/5 px-6 py-16">
          <div className="mx-auto max-w-4xl">
            {!selectedTicket ? (
              <>
                <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white md:text-3xl">
                      Your support tickets
                    </h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Track and manage every request in one thread.
                    </p>
                  </div>
                  <button onClick={() => setShowTicketForm(true)} className={CTA}>
                    <Plus weight="bold" className="h-4 w-4" />
                    New ticket
                  </button>
                </div>

                <div className="space-y-3">
                  {tickets.length === 0 ? (
                    <div className={`px-6 py-16 text-center ${CARD}`}>
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
                        <TicketIcon weight="duotone" className="h-7 w-7 text-primary" />
                      </div>
                      <h3 className="text-lg font-bold text-white">No tickets yet</h3>
                      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
                        Open your first ticket and we'll pick it up within 24 hours.
                      </p>
                      <button
                        onClick={() => setShowTicketForm(true)}
                        className={`mt-6 ${CTA}`}
                      >
                        <Plus weight="bold" className="h-4 w-4" />
                        Create ticket
                      </button>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicket(ticket)}
                        className={`group w-full p-5 text-left hover:border-white/20 hover:bg-white/[0.05] ${CARD}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-400">
                                {ticket.id}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle(
                                  ticket.status,
                                )}`}
                              >
                                {ticket.status.replace("-", " ")}
                              </span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityStyle(
                                  ticket.priority,
                                )}`}
                              >
                                {ticket.priority}
                              </span>
                            </div>
                            <h3 className="text-base font-semibold text-white">
                              {ticket.subject}
                            </h3>
                            <p className="mt-1 text-xs text-slate-400">
                              Created {formatDate(ticket.createdAt)} · Updated{" "}
                              {formatDate(ticket.lastUpdated)}
                            </p>
                            <p className="mt-3 line-clamp-2 text-sm text-slate-300">
                              {ticket.messages[ticket.messages.length - 1].message}
                            </p>
                          </div>
                          <CaretRight
                            weight="bold"
                            className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-primary"
                          />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="mb-6 inline-flex items-center gap-2 text-sm text-slate-300 transition-colors hover:text-white"
                >
                  <ArrowLeft weight="bold" className="h-4 w-4" />
                  Back to tickets
                </button>

                <div className={`mb-6 p-6 ${CARD}`}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-400">
                      {selectedTicket.id}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle(
                        selectedTicket.status,
                      )}`}
                    >
                      {selectedTicket.status.replace("-", " ")}
                    </span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${priorityStyle(
                        selectedTicket.priority,
                      )}`}
                    >
                      {selectedTicket.priority} priority
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white md:text-2xl">
                    {selectedTicket.subject}
                  </h2>
                  <p className="mt-2 text-xs text-slate-400">
                    Created {formatDate(selectedTicket.createdAt)} · Updated{" "}
                    {formatDate(selectedTicket.lastUpdated)}
                  </p>
                </div>

                <div className="mb-6 space-y-4">
                  {selectedTicket.messages.map((msg) => {
                    const isUser = msg.sender === "user";
                    return (
                      <div
                        key={msg.id}
                        className={`rounded-2xl border p-5 ${
                          isUser
                            ? "mr-8 border-white/10 bg-white/[0.03]"
                            : "ml-8 border-primary/25 bg-primary/[0.06]"
                        }`}
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                              isUser
                                ? "bg-white/10 text-white"
                                : "bg-primary text-[#050507]"
                            }`}
                          >
                            {isUser ? "You" : "S"}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-white">
                              {isUser ? "You" : "Support team"}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {formatDate(msg.timestamp)} at {formatTime(msg.timestamp)}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed text-slate-200">
                          {msg.message}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {selectedTicket.status !== "closed" && (
                  <form onSubmit={handleSendMessage} className={`p-6 ${CARD}`}>
                    <label
                      htmlFor="reply"
                      className="mb-3 block text-xs font-semibold text-slate-200"
                    >
                      Add a reply
                    </label>
                    <textarea
                      id="reply"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      rows={4}
                      placeholder="Type your message…"
                      className={`mb-4 resize-none ${FIELD}`}
                    />
                    <button type="submit" className={CTA}>
                      <PaperPlaneRight weight="bold" className="h-4 w-4" />
                      Send reply
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Create ticket modal */}
          <AnimatePresence>
            {showTicketForm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
                onClick={() => setShowTicketForm(false)}
              >
                <motion.div
                  initial={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
                  animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: EASE }}
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0d] p-8"
                >
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-xl font-bold text-white">Create support ticket</h3>
                    <button
                      onClick={() => setShowTicketForm(false)}
                      aria-label="Close"
                      className="text-slate-300 transition-colors hover:text-white"
                    >
                      <X weight="bold" className="h-6 w-6" />
                    </button>
                  </div>

                  <form onSubmit={handleCreateTicket} className="space-y-5">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-200">
                        Subject *
                      </label>
                      <input
                        type="text"
                        required
                        value={ticketForm.subject}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, subject: e.target.value })
                        }
                        className={FIELD}
                        placeholder="Brief description of your issue"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-200">
                          Category *
                        </label>
                        <select
                          required
                          value={ticketForm.category}
                          onChange={(e) =>
                            setTicketForm({ ...ticketForm, category: e.target.value })
                          }
                          className={FIELD}
                        >
                          <option value="" className="bg-[#0a0a0d]">Select category</option>
                          <option value="general" className="bg-[#0a0a0d]">General inquiry</option>
                          <option value="technical" className="bg-[#0a0a0d]">Technical support</option>
                          <option value="billing" className="bg-[#0a0a0d]">Billing & payments</option>
                          <option value="event" className="bg-[#0a0a0d]">Event management</option>
                          <option value="verification" className="bg-[#0a0a0d]">Verification</option>
                          <option value="feedback" className="bg-[#0a0a0d]">Feedback</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-2 block text-xs font-semibold text-slate-200">
                          Priority *
                        </label>
                        <select
                          required
                          value={ticketForm.priority}
                          onChange={(e) =>
                            setTicketForm({
                              ...ticketForm,
                              priority: e.target.value as "low" | "medium" | "high",
                            })
                          }
                          className={FIELD}
                        >
                          <option value="low" className="bg-[#0a0a0d]">Low</option>
                          <option value="medium" className="bg-[#0a0a0d]">Medium</option>
                          <option value="high" className="bg-[#0a0a0d]">High</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-semibold text-slate-200">
                        Description *
                      </label>
                      <textarea
                        required
                        rows={6}
                        value={ticketForm.description}
                        onChange={(e) =>
                          setTicketForm({ ...ticketForm, description: e.target.value })
                        }
                        className={`resize-none ${FIELD}`}
                        placeholder="Provide detailed information about your issue…"
                      />
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setShowTicketForm(false)}
                        className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors duration-200 hover:bg-white/[0.08]"
                      >
                        Cancel
                      </button>
                      <button type="submit" className={`flex-1 ${CTA}`}>
                        Create ticket
                      </button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* ── Contact ───────────────────────────────────────────────────── */}
      {activeTab === "contact" && (
        <section className="relative border-t border-white/5 px-6 py-16">
          <div className="mx-auto max-w-6xl">
            {/* Channels */}
            <div className="mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {contactOptions.map(({ Icon, title, description, action, href }) => {
                const external = href.startsWith("http");
                return (
                  <a
                    key={title}
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className={`group flex flex-col p-6 hover:border-white/20 hover:bg-white/[0.05] ${CARD}`}
                  >
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/12 text-primary">
                      <Icon weight="duotone" className="h-6 w-6" />
                    </div>
                    <h3 className="text-base font-bold text-white">{title}</h3>
                    <p className="mt-2 flex-1 text-sm text-slate-300">{description}</p>
                    <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      {action}
                      <ArrowUpRight
                        weight="bold"
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </p>
                  </a>
                );
              })}
            </div>

            {/* Message form */}
            <div className="mx-auto max-w-2xl">
              <div className="mb-8 text-center">
                <h2 className="text-2xl font-extrabold text-white md:text-3xl">
                  Send us a message
                </h2>
                <p className="mt-3 text-sm text-slate-300">
                  Can't find it in the FAQ? Our team replies within 24 hours.
                </p>
              </div>

              <AnimatePresence mode="wait">
                {submitted ? (
                  <motion.div
                    key="success"
                    initial={reduce ? undefined : { opacity: 0, y: 12 }}
                    animate={reduce ? undefined : { opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE }}
                    className="rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-8 text-center"
                  >
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                      <Check weight="bold" className="h-7 w-7" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Message sent</h3>
                    <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
                      We've received your message and will respond within 24 hours.
                    </p>
                  </motion.div>
                ) : (
                  <motion.form
                    key="form"
                    onSubmit={handleSubmit}
                    initial={reduce ? undefined : { opacity: 0 }}
                    animate={reduce ? undefined : { opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    className="space-y-5"
                  >
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label
                          htmlFor="name"
                          className="mb-2 block text-xs font-semibold text-slate-200"
                        >
                          Your name
                        </label>
                        <input
                          id="name"
                          type="text"
                          required
                          value={formData.name}
                          onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                          }
                          className={FIELD}
                          placeholder="Priya Reddy"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="email"
                          className="mb-2 block text-xs font-semibold text-slate-200"
                        >
                          Email address
                        </label>
                        <input
                          id="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                          }
                          className={FIELD}
                          placeholder="priya@example.com"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="category"
                        className="mb-2 block text-xs font-semibold text-slate-200"
                      >
                        Category
                      </label>
                      <select
                        id="category"
                        required
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value })
                        }
                        className={FIELD}
                      >
                        <option value="" className="bg-[#0a0a0d]">Select a category</option>
                        <option value="general" className="bg-[#0a0a0d]">General inquiry</option>
                        <option value="technical" className="bg-[#0a0a0d]">Technical support</option>
                        <option value="billing" className="bg-[#0a0a0d]">Billing & payments</option>
                        <option value="event" className="bg-[#0a0a0d]">Event management</option>
                        <option value="verification" className="bg-[#0a0a0d]">Verification</option>
                        <option value="feedback" className="bg-[#0a0a0d]">Feedback & suggestions</option>
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="message"
                        className="mb-2 block text-xs font-semibold text-slate-200"
                      >
                        Message
                      </label>
                      <textarea
                        id="message"
                        required
                        rows={6}
                        value={formData.message}
                        onChange={(e) =>
                          setFormData({ ...formData, message: e.target.value })
                        }
                        className={`resize-none ${FIELD}`}
                        placeholder="Describe your issue or question…"
                      />
                    </div>

                    <button type="submit" className={`w-full ${CTA}`}>
                      Send message
                    </button>
                  </motion.form>
                )}
              </AnimatePresence>
            </div>

            {/* Resources */}
            <div className="mt-16 border-t border-white/5 pt-14">
              <h2 className="mb-8 text-center text-2xl font-extrabold text-white md:text-3xl">
                Helpful resources
              </h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {resources.map((r) => (
                  <a
                    key={r.href}
                    href={r.href}
                    className={`group flex items-start justify-between gap-4 p-6 hover:border-white/20 hover:bg-white/[0.05] ${CARD}`}
                  >
                    <div>
                      <h3 className="text-base font-bold text-white transition-colors group-hover:text-primary">
                        {r.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-300">{r.body}</p>
                    </div>
                    <ArrowUpRight
                      weight="bold"
                      className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500 transition-all duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                    />
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </main>
  );
}
