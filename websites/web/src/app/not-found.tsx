import Link from "next/link";
import { ArrowRight } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Page not found",
  description: "The page you're looking for doesn't exist.",
};

const WAYS = [
  { label: "Events", href: "/events" },
  { label: "Spaces", href: "/spaces" },
  { label: "Host an event", href: "/organisers" },
  { label: "Support", href: "/support" },
];

/* The ticket's fine print: every field the door checks, none of them valid. */
const FIELDS: [string, string][] = [
  ["Event", "The page you wanted"],
  ["Venue", "Off the map"],
  ["Gate", "404"],
  ["Row", "—"],
  ["Seat", "Not found"],
  ["Entry", "Not on the list"],
];

/* Fixed bar widths so the barcode renders the same on server and client. */
const BARS = [3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2];

/* Half-circle bites where the stub tears off, cut in the page colour. */
function Notch({ className }: { className: string }) {
  return <span aria-hidden="true" className={`absolute h-6 w-6 rounded-full bg-canvas ${className}`} />;
}

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="flex flex-1 items-center px-4 pb-24 pt-32 sm:px-8 sm:pt-36">
        <div className="mx-auto w-full max-w-4xl">
          <p className="enter font-mono text-xs uppercase tracking-[0.2em] text-paper/50">Error 404 · Gate closed</p>
          <h1
            className="waterline-load mt-4 font-display text-[clamp(2rem,6vw,3.5rem)] font-bold leading-[1.05] text-paper"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="line">
              <span className="line-inner" style={{ ["--l" as string]: 0 }}>This page isn&apos;t</span>
            </span>
            <span className="line">
              <span className="line-inner" style={{ ["--l" as string]: 1 }}>on the lineup.</span>
            </span>
          </h1>

          {/* Printer: a slot on the left; the ticket feeds out of it, clipped
              at the slot so it reads as coming from inside. */}
          <div className="enter mt-10 flex items-stretch" style={{ ["--d" as string]: "150ms" }}>
            <div aria-hidden="true" className="relative z-10 -my-3 w-3 shrink-0 rounded-full bg-night-3 shadow-[inset_-2px_0_0_rgb(var(--glow)/0.12),6px_0_18px_rgb(var(--ground)/0.6)]" />
            <div className="stamp-thud min-w-0 flex-1 overflow-hidden">
          {/* Ticket: main body + tear-off stub. Stacks vertically on phones. */}
          <div
            className="print-feed relative flex flex-col overflow-hidden rounded-2xl rounded-l-none bg-night-2 sm:flex-row"
            role="img"
            aria-label="An event ticket for Gate 404, stamped void: the page you wanted was not found."
          >
            <div className="flex-1 p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/50">Admit one</span>
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-paper/50">No. 000404</span>
              </div>
              <p
                className="mt-5 font-display text-[clamp(4rem,14vw,7rem)] font-bold leading-[0.85] text-primary"
                style={{ letterSpacing: "-0.04em" }}
              >
                404
              </p>
              <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                {FIELDS.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper/45">{k}</dt>
                    <dd className="mt-1 truncate text-sm font-medium text-paper">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Perforation: dashed rule with notches at both ends. */}
            {/* Drawn with a gradient, not a border: the site strips all borders. */}
            <div
              aria-hidden="true"
              className="relative h-px shrink-0 bg-[repeating-linear-gradient(90deg,rgb(var(--glow)/0.25)_0_6px,transparent_6px_12px)] sm:h-auto sm:w-px sm:bg-[repeating-linear-gradient(180deg,rgb(var(--glow)/0.25)_0_6px,transparent_6px_12px)]"
            >
              <Notch className="-left-3 -top-3 sm:-left-3 sm:-top-3" />
              <Notch className="-right-3 -top-3 sm:-bottom-3 sm:-left-3 sm:right-auto sm:top-auto" />
            </div>

            <div className="relative flex items-center justify-between gap-6 p-6 sm:w-56 sm:flex-col sm:items-start sm:justify-center sm:p-8">
              <div>
                <div className="flex h-14 items-stretch gap-[2px]" aria-hidden="true">
                  {BARS.map((w, i) => (
                    <span key={i} className="bg-paper/80" style={{ width: `${w * 2}px` }} />
                  ))}
                </div>
                <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-paper/45">UNF-404-000404</p>
              </div>
              <span
                className="stamp -rotate-12 rounded-md px-3 py-1 font-mono text-sm font-bold uppercase tracking-[0.2em] text-destructive shadow-[inset_0_0_0_2px_var(--destructive)]"
              >
                Void
              </span>
            </div>
          </div>
            </div>
          </div>

          <p className="enter mt-8 max-w-md text-base leading-relaxed text-paper/70" style={{ ["--d" as string]: "400ms" }}>
            The link may have moved or been mistyped. Swap this ticket for a real one.
          </p>
          <div className="enter mt-7 flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: "500ms" }}>
            <Link href="/events" className="btn btn-lg btn-primary">
              Find an event
              <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/" className="btn btn-lg btn-secondary">
              Go home
            </Link>
          </div>
          <nav aria-label="Other places" className="enter mt-12 flex flex-wrap gap-x-6 gap-y-3" style={{ ["--d" as string]: "600ms" }}>
            {WAYS.map((w) => (
              <Link key={w.href} href={w.href} className="link-draw text-sm text-paper/60 transition-colors duration-150 hover:text-paper">
                {w.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <Footer />
    </main>
  );
}
