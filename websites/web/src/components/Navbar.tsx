"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useEmptySections } from "@/components/SiteContent";
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, type Variants } from "motion/react";
import { ArrowRight, CaretDown } from "@unifesto/unicon/react";
import Image from "next/image";
import Link from "next/link";
import { useLightSurfaceAt } from "@/lib/surface";
import ThemeToggle from "@/components/ThemeToggle";
import { useSignedIn } from "@/lib/auth";
import { DUR, EASE_IN_OUT_CUBIC, EASE_OUT_QUART } from "@/lib/motion";
import GooglePlayBadge from "@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg";
import AppStoreBadge from "@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg";

/* Information architecture. Organisers get their own menu (the platform and
   what runs on it), the two directories and pricing sit flat, and one menu
   holds the company and its resources. On the right, the two actions:
   students get the app, organisers host. */
type NavItem = { label: string; href: string; description?: string };

const LINKS: readonly NavItem[] = [
  { label: "Events", href: "/events" },
  { label: "Spaces", href: "/spaces" },
  { label: "Pricing", href: "/pricing" },
];

const MENUS: readonly { label: string; items: readonly NavItem[] }[] = [
  {
    label: "Organisers",
    items: [
      { label: "Platform", href: "/organisers", description: "Ticketing, check-in, payouts, one Space" },
      { label: "Unifesto Sprint", href: "/sprint", description: "Hackathons: teams, judging and help desks" },
      { label: "Unifesto Stay", href: "/stay", description: "Rooms for your event's guests" },
      { label: "Unifesto Huddle", href: "/huddle", description: "Online sessions for your Space" },
      { label: "Unifesto Orbit", href: "/orbit", description: "The campus programme for students" },
      { label: "Request a Space", href: "/request-space", description: "Get your club or institution set up" },
      { label: "Host one event", href: "/request-event", description: "No Space yet? We set one up for you" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "About", href: "/about", description: "Who builds Unifesto, and why" },
      { label: "Careers", href: "/careers", description: "Open roles" },
      { label: "Press", href: "/press", description: "Releases and media kit" },
      { label: "Blog", href: "/blog", description: "Notes from running events" },
      { label: "Support", href: "/support", description: "Help, FAQs and contact" },
    ],
  },
];

const STORES = [
  { label: "App Store", href: "https://apps.apple.com/in/app/unifesto-discover-events/id6767165496", image: AppStoreBadge },
  { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.unifesto.app", image: GooglePlayBadge },
] as const;

/* Menus pop from their trigger: ease-out-quart, 180ms in, faster out. */
const panel: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: DUR.swap * 0.75, ease: EASE_OUT_QUART } },
  exit: { opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12, ease: EASE_OUT_QUART } },
};
const panelReduced: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Menu({
  label,
  open,
  setOpen,
  align = "center",
  width,
  children,
  triggerClassName,
}: {
  label: string;
  open: boolean;
  setOpen: (v: boolean) => void;
  align?: "center" | "right";
  width: string;
  children: React.ReactNode;
  triggerClassName: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, setOpen]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        clearTimeout(closeTimer.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        closeTimer.current = setTimeout(() => setOpen(false), 140);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={triggerClassName}
      >
        {label}
        <CaretDown
          className={`h-3.5 w-3.5 opacity-60 transition-transform duration-[240ms] ease-[cubic-bezier(.645,.045,.355,1)] ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            id={id}
            variants={reduce ? panelReduced : panel}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={`blur-bg-strong absolute top-full z-50 mt-3 overflow-hidden rounded-3xl ${width} max-w-[92vw] ${
              align === "right" ? "right-0 origin-top-right" : "left-1/2 -translate-x-1/2 origin-top"
            }`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Navbar() {
  const pathname = usePathname() ?? "/";
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // One dropdown open at a time. A menu's delayed close only clears itself,
  // so leaving one trigger for another never shuts the new one.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuState = (key: string) => ({
    open: openMenu === key,
    setOpen: (v: boolean) => setOpenMenu((cur) => (v ? key : cur === key ? null : cur)),
  });
  const [hovered, setHovered] = useState<string | null>(null);
  const empty = useEmptySections();
  const menus = MENUS.map((m) => ({ ...m, items: m.items.filter((i) => !empty.has(i.href)) }));
  const onLight = useLightSurfaceAt(() => [window.innerWidth / 2, 40]);
  const account = useSignedIn() ? { label: "My dashboard", href: "/console" } : { label: "Sign in", href: "/login" };

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 24));

  // Close the mobile sheet on navigation (adjust state during render when the
  // route changes, rather than in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  // Lock the page behind the open sheet so swipes scroll the sheet, not home.
  useEffect(() => {
    if (!menuOpen) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [menuOpen]);

  const linkClass = (active: boolean) =>
    `relative z-10 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ${
      active ? "text-paper" : "text-paper/70 hover:text-paper"
    }`;

  const renderMenu = (m: (typeof MENUS)[number]) => (
    <Menu
      key={m.label}
      label={m.label}
      {...menuState(m.label)}
      width="w-[340px]"
      triggerClassName={linkClass(m.items.some((c) => isActive(pathname, c.href)))}
    >
      <ul className="p-2">
        {m.items.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              aria-current={isActive(pathname, c.href) ? "page" : undefined}
              onClick={() => setOpenMenu(null)}
              className="group/c flex items-start justify-between gap-4 rounded-lg px-4 py-3 transition-colors duration-150 hover:bg-paper/[0.07]"
            >
              <span>
                <span className="block text-sm font-semibold text-paper">{c.label}</span>
                <span className="mt-0.5 block text-xs text-paper/60">{c.description}</span>
              </span>
              <ArrowRight
                className="mt-1 h-4 w-4 shrink-0 -translate-x-1 text-primary opacity-0 transition-[opacity,transform] duration-150 group-hover/c:translate-x-0 group-hover/c:opacity-100"
                aria-hidden="true"
              />
            </a>
          </li>
        ))}
      </ul>
    </Menu>
  );

  // Mobile sheet groups: the flat links (plus the app page), then each menu.
  const SHEET = [
    { label: null, items: [...LINKS, { label: "The app", href: "/app" }] },
    ...menus,
  ];

  return (
    <header className={`fixed inset-x-0 top-0 z-50 ${onLight ? "on-light" : ""}`}>
      {/* Full-width bar. Transparent over the hero; once scrolled (or with
          the menu open) a blurred tint fades in behind it (opacity, 240ms). */}
      <span
        aria-hidden="true"
        className={`blur-bg absolute inset-0 -z-10 transition-opacity duration-[240ms] ${
          scrolled || menuOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <nav className="relative flex h-16 items-center justify-between md:h-[4.5rem]" aria-label="Primary">
          <Link href="/" aria-label="Unifesto home" className="flex shrink-0 items-center">
            <Image
              src="/UnifestoAppWordmark.png"
              alt="Unifesto"
              width={640}
              height={200}
              priority
              sizes="116px"
              className="h-8 w-auto brightness-0 invert md:h-9"
            />
          </Link>

          {/* Desktop. A soft pill slides to whichever link is hovered:
              the same plate moving between items (morph, 240ms). */}
          <div className="hidden items-center lg:flex" onMouseLeave={() => setHovered(null)}>
            {menus.slice(0, 1).map(renderMenu)}
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => setHovered(l.href)}
                  className={linkClass(active)}
                >
                  {hovered === l.href && (
                    <motion.span
                      layoutId="nav-hover"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-full bg-paper/[0.08]"
                      transition={reduce ? { duration: 0 } : { duration: DUR.swap, ease: EASE_IN_OUT_CUBIC }}
                    />
                  )}
                  {l.label}
                  {active && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" />}
                </a>
              );
            })}
            {menus.slice(1).map(renderMenu)}
          </div>

          <div className="hidden items-center gap-2 lg:flex">
            <ThemeToggle />
            {/* No room for it in the bar below xl; the app menu carries it there. */}
            <a
              href={account.href}
              aria-current={isActive(pathname, account.href) ? "page" : undefined}
              className={`${linkClass(isActive(pathname, account.href))} hidden whitespace-nowrap xl:flex`}
            >
              {account.label}
            </a>
            <Menu
              label="Get the app"
              {...menuState("app")}
              align="right"
              width="w-[300px]"
              triggerClassName="btn btn-sm btn-secondary"
            >
              <div className="p-5">
                <p className="text-sm font-semibold text-paper">Your passes live in the app.</p>
                <p className="mt-1 text-xs leading-relaxed text-paper/60">
                  Register in a tap, check in with one scan.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  {STORES.map((s) => (
                    <a key={s.label} href={s.href} className="transition-opacity duration-150 hover:opacity-80">
                      <Image src={s.image} alt={`Download Unifesto on ${s.label}`} className="h-10 w-auto" />
                    </a>
                  ))}
                </div>
                <Link
                  href="/app"
                  onClick={() => setOpenMenu(null)}
                  className="link-draw mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-paper/80 hover:text-paper"
                >
                  See what&rsquo;s inside
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <a
                  href={account.href}
                  onClick={() => setOpenMenu(null)}
                  className="link-draw mt-2 flex w-fit text-xs font-semibold text-paper/80 hover:text-paper xl:hidden"
                >
                  {account.label} on the web
                </a>
              </div>
            </Menu>
            <Link href="/request-space" className="btn btn-sm btn-primary">
              Host an event
              <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
            </Link>
          </div>

          <ThemeToggle className="ml-auto mr-1 lg:hidden" />

          {/* Mobile toggle: three bars morph into a cross (240ms). */}
          <button
            className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-paper lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span className="flex w-5 flex-col gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`h-0.5 rounded-full bg-current transition-[transform,opacity] duration-[240ms] ease-[cubic-bezier(.645,.045,.355,1)] ${
                    menuOpen
                      ? i === 0
                        ? "translate-y-2 rotate-45"
                        : i === 1
                          ? "opacity-0"
                          : "-translate-y-2 -rotate-45"
                      : ""
                  }`}
                />
              ))}
            </span>
          </button>
        </nav>

        {/* Mobile sheet: drops from the capsule, items arrive as a list. */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              key="sheet"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DUR.swap, ease: EASE_OUT_QUART } }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.14 } }}
              className="blur-bg-strong mb-4 mt-1 max-h-[calc(100dvh-5rem)] origin-top overflow-y-auto overscroll-contain rounded-3xl lg:hidden"
            >
              <motion.ul
                className="p-3"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: reduce ? 0 : 0.035 } } }}
              >
                {SHEET.flatMap((g) => [
                  ...(g.label
                    ? [
                        <motion.li
                          key={`h-${g.label}`}
                          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                          className="px-4 pb-1 pt-4 text-xs font-semibold text-paper/45"
                        >
                          {g.label}
                        </motion.li>,
                      ]
                    : []),
                  ...g.items.map((l) => (
                    <motion.li
                      key={l.href}
                      variants={{
                        hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 6 },
                        visible: { opacity: 1, y: 0, transition: { duration: DUR.swap, ease: EASE_OUT_QUART } },
                      }}
                    >
                      <a
                        href={l.href}
                        aria-current={isActive(pathname, l.href) ? "page" : undefined}
                        className="flex items-center justify-between rounded-lg px-4 py-3 text-base font-medium text-paper/85 transition-colors duration-150 hover:bg-paper/[0.07] aria-[current=page]:text-paper"
                      >
                        {l.label}
                        {isActive(pathname, l.href) && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
                      </a>
                    </motion.li>
                  )),
                ])}
              </motion.ul>
              <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
                <a href={account.href} className="btn btn-secondary w-full">
                  {account.label}
                </a>
                <Link href="/request-space" className="btn btn-primary w-full">
                  Host an event
                  <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
                </Link>
                <div className="flex items-center justify-center gap-3">
                  {STORES.map((s) => (
                    <a key={s.label} href={s.href}>
                      <Image src={s.image} alt={`Download Unifesto on ${s.label}`} className="h-10 w-auto" />
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
