import Image from "next/image";
import { LEGAL } from "@/lib/legal";
import { SOCIAL } from "@/lib/site";
import GooglePlayBadge from "@/app/assets/svg/GetItOnGooglePlay_Badge_Web_color_English.svg";
import AppStoreBadge from "@/app/assets/svg/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg";

const socials = [
  {
    label: "Instagram",
    href: SOCIAL.instagram,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: SOCIAL.linkedin,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: SOCIAL.youtube,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    label: "X / Twitter",
    href: SOCIAL.x,
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
];

/* Four columns mirror the navbar: discover, organisers, company, help.
   Legal pages are reference, not navigation, so they sit in the bottom bar. */
const COLUMNS = [
  {
    title: "Discover",
    links: [
      { label: "Events", href: "/events" },
      { label: "Spaces", href: "/spaces" },
      { label: "The app", href: "/app" },
    ],
  },
  {
    title: "Organisers",
    links: [
      { label: "Platform", href: "/organisers" },
      { label: "Unifesto Sprint", href: "/sprint" },
      { label: "Unifesto Stay", href: "/stay" },
      { label: "Unifesto Huddle", href: "/huddle" },
      { label: "Unifesto Orbit", href: "/orbit" },
      { label: "Pricing", href: "/pricing" },
      { label: "Request a Space", href: "/request-space" },
      { label: "Host one event", href: "/request-event" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Careers", href: "/careers" },
      { label: "Press", href: "/press" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "Support", href: "/support" },
      { label: "Refunds", href: "/refund" },
      { label: "Grievance redressal", href: "/grievance" },
      { label: "Delete account", href: "/delete-account" },
    ],
  },
];

const LEGAL_LINKS = [
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
  { label: "Privacy notice", href: "/privacy-notice" },
  { label: "Cookies", href: "/cookies" },
  { label: "Code of conduct", href: "/code-of-conduct" },
  { label: "Data rights", href: "/data-rights" },
  { label: "Privacy requests", href: "/privacy-requests" },
  { label: "Subprocessors", href: "/subprocessors" },
  { label: "Security", href: "/security" },
];

/* The page's anchor: one big line, the four ways onward, the stores, and
   the legal row.
   No newsletter box: there is nothing behind it to subscribe to. */
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer aria-label="Site footer" className="surface-night relative">
      <div className="mx-auto max-w-7xl px-5 pb-10 pt-20 sm:px-8 md:pt-28">
        <div className="grid gap-14 lg:grid-cols-[1.1fr_1.4fr] lg:gap-20">
          <div>
            <p
              data-reveal="blur"
              className="max-w-md font-display text-[clamp(1.75rem,3.4vw,2.5rem)] font-bold leading-[1.05] text-paper [text-wrap:balance]"
              style={{ letterSpacing: "-0.03em" }}
            >
              Run the whole event. <span className="text-primary">From one Space.</span>
            </p>
            <div className="mt-8 flex items-center gap-3">
              {[
                { label: "App Store", href: "https://apps.apple.com/in/app/unifesto-discover-events/id6767165496", image: AppStoreBadge },
                { label: "Google Play", href: "https://play.google.com/store/apps/details?id=com.unifesto.app", image: GooglePlayBadge },
              ].map((s) => (
                <a key={s.label} href={s.href} className="transition-opacity duration-150 hover:opacity-80">
                  <Image src={s.image} alt={`Download Unifesto on ${s.label}`} className="h-10 w-auto" />
                </a>
              ))}
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-10 sm:grid-cols-4" data-stagger="rise">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h2 className="mb-4 text-sm font-semibold text-paper">{col.title}</h2>
                <ul className="flex flex-col gap-3">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} className="link-draw text-sm text-paper/60 transition-colors duration-150 hover:text-paper">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-20 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-1">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={s.label}
                className="flex h-10 w-10 items-center justify-center rounded-full text-paper/60 transition-colors duration-150 hover:bg-paper/[0.07] hover:text-paper"
              >
                {s.icon}
              </a>
            ))}
            <a href="mailto:support@unifesto.app" className="link-draw ml-3 text-sm text-paper/60 transition-colors duration-150 hover:text-paper">
              support@unifesto.app
            </a>
          </div>
          <p className="text-xs text-paper/50">© {year} {LEGAL.company} · CIN {LEGAL.cin}</p>
        </div>

        <nav aria-label="Legal" className="mt-8 border-t border-paper/10 pt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="link-draw text-xs text-paper/50 transition-colors duration-150 hover:text-paper">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
