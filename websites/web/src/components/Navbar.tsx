"use client";

import { useState, useEffect, useRef, useId } from "react";
import {
  useScroll,
  useMotionValueEvent,
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react";
import { CaretDown, ArrowUpRight } from "@phosphor-icons/react";
import Image from "next/image";
import GooglePlayBadge from "@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg";
import AppStoreBadge from "@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg";

const EASE = [0.22, 1, 0.36, 1] as const;

type SubItem = { label: string; href: string; description?: string; image?: any };
type Column = { title: string; items: SubItem[] };

type NavItem = {
  label: string;
  href?: string;
  columns?: Column[];
  items?: SubItem[];
  badges?: SubItem[];
};

const navItems: NavItem[] = [
  {
    label: "Discover",
    columns: [
      {
        title: "Events",
        items: [
          { label: "All Events", href: "/events", description: "Browse everything" },
          { label: "Trending", href: "/events?status=trending", description: "What everyone is talking about" },
          { label: "Upcoming", href: "/events?status=upcoming", description: "Don't miss what's next" },
          { label: "Featured", href: "/events?status=featured", description: "Handpicked by the team" },
        ],
      },
      {
        title: "Spaces",
        items: [
          { label: "Browse All", href: "/spaces", description: "Universities, clubs & more" },
          { label: "Institutions", href: "/spaces?type=university", description: "Top-level institutions" },
          { label: "Clubs", href: "/spaces?type=club", description: "Clubs, cells & departments" },
          { label: "Communities", href: "/spaces?type=community", description: "Independent groups" },
          { label: "Request a Space", href: "/request-space", description: "Run yours on Unifesto" },
        ],
      },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Team & access", href: "/features#team", description: "Spaces, five roles, permissions" },
      { label: "Events", href: "/features#events", description: "RSVP, ticketing, sub-events, sessions" },
      { label: "The door", href: "/features#door", description: "Multi-point QR check-in" },
      { label: "Money", href: "/features#money", description: "Payouts, refunds, financials" },
      { label: "Grow", href: "/features#grow", description: "Certificates, leaderboards, leads" },
    ],
  },
  {
    label: "About",
    items: [
      { label: "About Us", href: "/about", description: "Our story & mission" },
      { label: "Features", href: "/about#features", description: "What we offer" },
      { label: "Use Cases", href: "/about#use-cases", description: "Events we support" },
      { label: "Testimonials", href: "/about#testimonials", description: "What people say" },
      { label: "Support", href: "/support", description: "Get help & contact us" },
    ],
  },
  {
    label: "Download",
    badges: [
      {
        label: "App Store",
        href: "https://apps.apple.com/in/app/unifesto-discover-events/id6767165496",
        image: AppStoreBadge,
      },
      {
        label: "Google Play",
        href: "https://play.google.com/store/apps/details?id=com.unifesto.app",
        image: GooglePlayBadge,
      },
    ],
  },
];

const panelVariants: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(6px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.24, ease: EASE } },
  exit: { opacity: 0, y: 6, filter: "blur(4px)", transition: { duration: 0.14, ease: EASE } },
};

const reducedPanel: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

function SubLink({ sub, onNavigate }: { sub: SubItem; onNavigate?: () => void }) {
  return (
    <a
      href={sub.href}
      onClick={onNavigate}
      className="group/link -mx-3 block rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-1.5 text-sm font-medium text-white/90 group-hover/link:text-white">
        {sub.label}
        <ArrowUpRight
          className="h-3.5 w-3.5 -translate-x-1 text-primary opacity-0 transition-all duration-200 group-hover/link:translate-x-0 group-hover/link:opacity-100"
          aria-hidden="true"
        />
      </div>
      {sub.description && <p className="mt-0.5 text-xs leading-snug text-slate-400">{sub.description}</p>}
    </a>
  );
}

function DesktopItem({
  item,
  openLabel,
  onOpen,
  onClose,
}: {
  item: NavItem;
  openLabel: string | null;
  onOpen: (label: string) => void;
  onClose: () => void;
}) {
  const panelId = useId();
  const reduce = useReducedMotion();
  const hasPanel = Boolean(item.columns || item.items || item.badges);
  const isOpen = openLabel === item.label;

  if (!hasPanel && item.href) {
    return (
      <a
        href={item.href}
        className="rounded-full px-4 py-2 text-sm font-medium tracking-wide text-slate-300 transition-colors duration-150 hover:text-white"
      >
        {item.label}
      </a>
    );
  }

  const isDownload = Boolean(item.badges);

  return (
    <div className="relative" onMouseEnter={() => onOpen(item.label)} onMouseLeave={onClose}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => (isOpen ? onClose() : onOpen(item.label))}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium tracking-wide transition-colors duration-150 ${
          isOpen ? "text-white" : "text-slate-300 hover:text-white"
        }`}
      >
        <span>{item.label}</span>
        <CaretDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${isOpen ? "rotate-180 !text-primary" : ""}`}
          aria-hidden="true"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={panelId}
            key="panel"
            variants={reduce ? reducedPanel : panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`absolute left-1/2 top-full z-50 mt-3 -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d] shadow-[0_24px_80px_rgba(0,0,0,0.7)] ${
              item.columns ? "w-[560px]" : isDownload ? "w-[380px]" : "w-[320px]"
            } max-w-[92vw]`}
          >
            {item.columns && (
              <div className="grid grid-cols-2 gap-6 p-5">
                {item.columns.map((col) => (
                  <div key={col.title}>
                    <h3 className="mb-2 border-b border-white/10 pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                      {col.title}
                    </h3>
                    <div className="space-y-0.5">
                      {col.items.map((sub) => (
                        <SubLink key={sub.label} sub={sub} onNavigate={onClose} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {item.items && (
              <div className="space-y-0.5 p-4">
                {item.items.map((sub) => (
                  <SubLink key={sub.label} sub={sub} onNavigate={onClose} />
                ))}
              </div>
            )}

            {item.badges && (
              <div className="p-5">
                <p className="mb-3 text-xs font-medium text-slate-400">Get Unifesto on your phone</p>
                <div className="flex flex-row items-center gap-3">
                  {item.badges.map((sub) => (
                    <a key={sub.label} href={sub.href} className="block transition-opacity duration-150 hover:opacity-80">
                      <Image src={sub.image} alt={`Download Unifesto on ${sub.label}`} className="h-11 w-auto object-contain" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 24);
  });

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const handleOpen = (label: string) => {
    clearTimeout(closeTimer.current);
    setOpenLabel(label);
  };
  const handleClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenLabel(null), 140);
  };

  const linkItems = navItems.filter((i) => i.label !== "Download");
  const downloadItem = navItems.find((i) => i.label === "Download");

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[#050507]/85 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 md:px-10">
        <nav className="flex h-16 items-center justify-between md:h-20" aria-label="Primary navigation">
          {/* Logo — Unifesto wordmark */}
          <a href="/" aria-label="Unifesto home" className="flex items-center">
            <Image
              src="/UnifestoAppWordmark.png"
              alt="Unifesto"
              width={640}
              height={200}
              priority
              className="h-8 w-auto transition-opacity duration-200 hover:opacity-90 md:h-9"
            />
          </a>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <DesktopItem key={item.label} item={item} openLabel={openLabel} onOpen={handleOpen} onClose={handleClose} />
            ))}
            <a
              href="/events"
              className="ml-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-black transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_85%,black)]"
            >
              Explore events
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          {/* Mobile toggle */}
          <button
            className="rounded-lg p-2 text-primary transition-colors md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <div className="flex w-5 flex-col gap-1.5">
              <span className={`h-0.5 rounded-full bg-current transition-all duration-300 ${menuOpen ? "translate-y-2 rotate-45" : ""}`} />
              <span className={`h-0.5 rounded-full bg-current transition-all duration-300 ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`h-0.5 rounded-full bg-current transition-all duration-300 ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} />
            </div>
          </button>
        </nav>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="mobile"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              className="overflow-hidden md:hidden"
            >
              <div className="mb-4 mt-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0d]">
                <div className="p-2">
                  {linkItems.map((item) => {
                    const hasPanel = Boolean(item.columns || item.items);
                    if (!hasPanel && item.href) {
                      return (
                        <a
                          key={item.label}
                          href={item.href}
                          className="block rounded-xl px-3 py-3 text-base font-medium text-slate-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.label}
                        </a>
                      );
                    }
                    const expanded = mobileExpanded === item.label;
                    return (
                      <div key={item.label}>
                        <button
                          className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-base font-medium text-slate-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                          onClick={() => setMobileExpanded(expanded ? null : item.label)}
                          aria-expanded={expanded}
                        >
                          <span>{item.label}</span>
                          <CaretDown
                            className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180 !text-primary" : "text-slate-500"}`}
                            aria-hidden="true"
                          />
                        </button>
                        <AnimatePresence>
                          {expanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: EASE }}
                              className="overflow-hidden pb-1 pl-3"
                            >
                              {item.columns
                                ? item.columns.map((col) => (
                                    <div key={col.title} className="mb-3">
                                      <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
                                        {col.title}
                                      </div>
                                      {col.items.map((sub) => (
                                        <a
                                          key={sub.label}
                                          href={sub.href}
                                          className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                                          onClick={() => setMenuOpen(false)}
                                        >
                                          {sub.label}
                                        </a>
                                      ))}
                                    </div>
                                  ))
                                : item.items?.map((sub) => (
                                    <a
                                      key={sub.label}
                                      href={sub.href}
                                      className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/[0.06] hover:text-white"
                                      onClick={() => setMenuOpen(false)}
                                    >
                                      {sub.label}
                                    </a>
                                  ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}

                  <a
                    href="/events"
                    className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-black transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--primary)_85%,black)]"
                    onClick={() => setMenuOpen(false)}
                  >
                    Explore events
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </a>

                  {downloadItem?.badges && (
                    <div className="mt-4 flex flex-col items-center gap-3 border-t border-white/10 px-3 pb-5 pt-4">
                      <p className="text-xs font-medium text-slate-400">Get Unifesto on your phone</p>
                      <div className="flex items-center gap-4">
                        {downloadItem.badges.map((sub) => (
                          <a key={sub.label} href={sub.href} className="transition-opacity duration-150 hover:opacity-80">
                            <Image src={sub.image} alt={`Download Unifesto on ${sub.label}`} className="h-11 w-auto object-contain" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
