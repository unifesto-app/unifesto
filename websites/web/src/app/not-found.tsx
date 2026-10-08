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

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden bg-canvas">
      <Navbar />
      <section className="flex flex-1 items-center px-5 pb-24 pt-36 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <h1
            className="waterline-load font-display text-[clamp(5rem,18vw,9rem)] font-bold leading-[0.9] text-primary"
            style={{ letterSpacing: "-0.04em" }}
          >
            <span className="line">
              <span className="line-inner">404</span>
            </span>
          </h1>
          <p
            className="enter mt-6 font-display text-[clamp(1.5rem,3.4vw,2.25rem)] font-bold leading-tight text-paper"
            style={{ letterSpacing: "-0.03em", ["--d" as string]: "200ms" }}
          >
            This page isn&apos;t here.
          </p>
          <p className="enter mt-4 max-w-md text-base leading-relaxed text-paper/70" style={{ ["--d" as string]: "300ms" }}>
            It may have moved, or the link was mistyped. These will get you back on track.
          </p>
          <div className="enter mt-9 flex flex-col gap-3 sm:flex-row" style={{ ["--d" as string]: "420ms" }}>
            <Link href="/" className="btn btn-lg btn-primary">
              Go home
              <ArrowRight className="btn-arrow h-4 w-4" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/events" className="btn btn-lg btn-secondary">
              Browse events
            </Link>
          </div>
          <nav aria-label="Other places" className="enter mt-14 flex flex-wrap gap-x-6 gap-y-3" style={{ ["--d" as string]: "520ms" }}>
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
