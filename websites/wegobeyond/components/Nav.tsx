"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// "#…" are home sections; "/…" are pages of their own.
const LINKS = [
  { href: "#what", label: "What we run" },
  { href: "#initiatives", label: "Initiatives" },
  { href: "/encore", label: "Encore" },
  { href: "#partners", label: "Partners" },
  { href: "#crew", label: "Crew" },
  { href: "#contact", label: "Contact" },
];

// Sticky header: title left, links in a slate pill centre, rust action right.
// Below 1280px: title + Menu, links drop down below.
export default function Nav() {
  const [open, setOpen] = useState(false);
  // On the home page "#…" links scroll in place (smoothly, via CSS);
  // on other pages they lead back to the home section.
  const path = usePathname();
  const base = path === "/" ? "" : "/";
  const to = (href: string) => (href.startsWith("#") ? base + href : href);
  const close = () => setOpen(false);

  return (
    <header className="wrap sticky top-0 z-50 grid grid-cols-[1fr_auto] items-center gap-y-2 bg-ink py-[18px] shadow-[0_0_0_100vmax_var(--color-ink)] [clip-path:inset(0_-100vmax)] xl:grid-cols-[1fr_auto_1fr]">
      <Link href="/" className="title justify-self-start" onClick={close}>
        wegobeyond
      </Link>

      <nav aria-label="Primary" className="small hidden gap-0.5 rounded-full bg-slate p-1.5 xl:flex">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={to(l.href)}
            aria-current={l.href === path ? "page" : undefined}
            className="rounded-full px-[18px] py-[11px] transition-colors hover:bg-paper hover:text-ink aria-[current=page]:bg-paper aria-[current=page]:text-ink"
          >
            {l.label}
          </a>
        ))}
      </nav>

      <a href={`${base}#partners`} className="btn btn-rust hidden justify-self-end xl:inline-flex">
        Partner with us
      </a>

      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-paper justify-self-end px-5 py-3.5 xl:hidden"
      >
        {open ? "Close" : "Menu"}
      </button>

      {open && (
        <nav id="mobile-menu" aria-label="Primary" className="col-span-full max-h-[calc(100svh-5rem)] overflow-y-auto xl:hidden">
          <ul>
            {LINKS.map((l) => (
              <li key={l.href} className="border-t-[1.5px] border-line">
                <a href={to(l.href)} onClick={close} aria-current={l.href === path ? "page" : undefined} className="title block py-4 aria-[current=page]:text-rust">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <a href={`${base}#partners`} onClick={close} className="btn btn-rust mb-2 mt-2 w-full">
            Partner with us
          </a>
        </nav>
      )}
    </header>
  );
}
