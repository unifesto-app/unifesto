"use client";

import { useState } from "react";
import Image from "next/image";

const socials = [
  {
    label: "Instagram",
    href: "https://instagram.com/unifesto.app",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://linkedin.com/company/unifesto",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: "X / Twitter",
    href: "https://x.com/unifestoapp",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

const featureLinks = [
  { label: "Event Discovery", href: "/features#event-discovery" },
  { label: "Forge", href: "/features#forge" },
  { label: "Gate", href: "/features#gate" },
  { label: "Ticketing & RSVP", href: "/features#ticketing-rsvp" },
  { label: "Analytics", href: "/features#analytics" },
];

const companyLinks = [
  { label: "About Us", href: "/about" },
  { label: "Careers", href: "/careers" },
  { label: "Blog", href: "/blog" },
  { label: "Docs", href: "/docs" },
];

const supportLinks = [
  { label: "Help Center", href: "/support" },
  { label: "FAQs", href: "/support#faq" },
  { label: "Contact Us", href: "/support#contact" },
  { label: "Live Chat", href: "#chat" },
  { label: "Email Support", href: "mailto:support@unifesto.app" },
];

const legalLinks = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Refund Policy", href: "/refund" },
  { label: "Terms & Conditions", href: "/terms" },
];

function LinkColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-white uppercase tracking-widest mb-4">{title}</h3>
      <ul className="flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-sm text-slate-400 hover:text-white transition-colors duration-200">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) { setSubscribed(true); setEmail(""); }
  };

  return (
    <footer aria-label="Site footer" className="relative bg-canvas border-t border-white/5 px-6">
      {/* Top gradient line */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px pointer-events-none"
        style={{ background: "linear-gradient(90deg, transparent, var(--primary), transparent)" }}
        aria-hidden="true"
      />

      <div className="max-w-7xl mx-auto">

        {/* Newsletter strip */}
        <div className="border-b border-white/5 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <p className="text-base font-semibold text-white">Stay in the loop</p>
            <p className="text-sm text-slate-400 mt-0.5">Get event updates straight to your inbox.</p>
          </div>
          {subscribed ? (
            <p className="text-sm font-medium text-primary">You&apos;re subscribed!</p>
          ) : (
            <form onSubmit={handleSubscribe} className="flex items-center gap-2 w-full md:w-auto">
              <input
                id="footer-newsletter-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 md:w-64 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder-slate-500 outline-none hover:border-white/20 focus:border-primary transition-colors duration-200"
              />
              <button
                type="submit"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-black transition-transform duration-200 hover:-translate-y-0.5 whitespace-nowrap"
              >
                Subscribe
              </button>
            </form>
          )}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-8 py-12">

          {/* Brand column: spans 2 on lg */}
          <div className="col-span-2 flex flex-col gap-4">
            <a href="/" aria-label="Unifesto home">
              {/* Same wordmark asset as the navbar — one rendering of the brand. */}
              <Image
                src="/UnifestoAppWordmark.png"
                alt="Unifesto"
                width={640}
                height={200}
                className="h-7 w-auto"
              />
            </a>
            <p className="text-sm text-slate-400 leading-relaxed max-w-[220px]">
              The all-in-one event platform to discover, host, and elevate events.
            </p>
            <div className="flex items-center gap-2 mt-1">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-200"
                >
                  {s.icon}
                </a>
              ))}
            </div>
            <a href="mailto:support@unifesto.app" className="text-sm text-slate-400 hover:text-white transition-colors duration-200 mt-1">
              support@unifesto.app
            </a>
          </div>

          <LinkColumn title="Features" links={featureLinks} />
          <LinkColumn title="Company" links={companyLinks} />
          <LinkColumn title="Support" links={supportLinks} />
          <LinkColumn title="Legal" links={legalLinks} />

        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/5 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-[11px] tracking-[0.2em] font-semibold text-primary">
            #UnifestoEverywhere
          </p>
          <p className="text-xs text-slate-400">
            © {currentYear} Unifesto Private Limited. All rights reserved.
          </p>
        </div>

      </div>
    </footer>
  );
}
