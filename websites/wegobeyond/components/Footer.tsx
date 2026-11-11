import type { ReactNode } from "react";
import Link from "next/link";
import { LINKS, ORG, getContent, type Social } from "@/lib/site";

// The networks' own marks, single colour (each brand's guidelines allow a
// one-colour version), drawn on a 24px grid and filled with currentColor.
const LOGOS: Record<Social["network"], ReactNode> = {
  instagram: (
    <>
      <rect x="2.2" y="2.2" width="19.6" height="19.6" rx="5.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="17.6" cy="6.4" r="1.4" />
    </>
  ),
  linkedin: (
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  ),
  x: (
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  ),
  youtube: (
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  ),
};

// "/#…" so the links work from the crew page too.
const siteLinks = (hasPhotos: boolean) => [
  { href: "/#what", label: "What we run" },
  { href: "/#initiatives", label: "Initiatives" },
  { href: "/orbit", label: "Unifesto Orbit" },
  // The gallery only renders once it has photos, so its link waits too.
  ...(hasPhotos ? [{ href: "/#moments", label: "Moments" }] : []),
  { href: "/#partners", label: "Partners" },
  { href: "/crew", label: "The crew" },
  { href: "/#press", label: "Press" },
  { href: "/#contact", label: "Contact" },
];

export default async function Footer() {
  const { community, gallery, policies, socials, support } = await getContent();

  return (
    <footer className="wrap pb-8">
      {/* The page's closing block: rust, ink type, the wordmark across the bottom. */}
      <div className="overflow-hidden rounded-[36px] bg-rust p-7 text-ink sm:p-12 lg:p-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          <nav aria-label="Site" className="title flex flex-col items-start gap-2">
            {siteLinks(gallery.length > 0).map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-paper">
                {l.label}
              </a>
            ))}
          </nav>

          <nav aria-label="Get involved" className="title flex flex-col items-start gap-2">
            <a href={LINKS.whatsOn} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-paper">
              See what&rsquo;s on ↗
            </a>
            <Link href="/volunteer" className="transition-colors hover:text-paper">
              Join the crew
            </Link>
            {community && (
              <a href={community} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-paper">
                Join the community ↗
              </a>
            )}
            {support && (
              <a href={support} target="_blank" rel="noreferrer noopener" className="transition-colors hover:text-paper">
                Back the community ↗
              </a>
            )}
          </nav>

          <div className="flex flex-col gap-5 lg:items-end">
            {socials.map((s) => (
              <div key={s.brand} className="lg:text-right">
                <p className="caption">{s.brand}</p>
                {/* Bare logos; the 44px hit area is invisible, so the row is pulled out by its padding. */}
                <ul className="-mx-2.5 mt-1 flex lg:justify-end">
                  {s.accounts.map((a) => (
                    <li key={a.href}>
                      <a
                        href={a.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`${s.brand} on ${a.label}`}
                        className="grid h-11 w-11 place-items-center transition-colors hover:text-paper"
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                          {LOGOS[a.network]}
                        </svg>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom-right corner, sized in container units: the word measures 5.65em
            wide at this tracking, so 10.6cqi takes 60% of the panel at every width. */}
        <div className="@container mt-16 text-right lg:mt-24">
          <p aria-hidden="true" className="whitespace-nowrap text-[10.6cqi] font-bold leading-[0.8] tracking-[-0.06em]">
            wegobeyond
          </p>
        </div>
      </div>

      {/* Unifesto's policies, centred at the very bottom. */}
      <div className="mt-8 flex flex-col items-center gap-3 text-center caption text-silver">
        <nav aria-label="Policies" className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {policies.map((p) => (
            <a key={p.href} href={p.href} target="_blank" rel="noreferrer noopener" className="hover:text-paper">
              {p.label}
            </a>
          ))}
        </nav>
        <p>
          © {new Date().getFullYear()} {ORG.legalName}
        </p>
      </div>
    </footer>
  );
}
