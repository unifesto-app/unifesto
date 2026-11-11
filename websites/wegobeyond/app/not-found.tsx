import type { Metadata } from "next";
import Link from "next/link";
import { LINKS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

// Same shape as the hero: one big line, a subline, two ways on.
export default function NotFound() {
  return (
    <section className="wrap flex min-h-[calc(100svh-88px)] flex-col justify-center pb-16 pt-10">
      <p className="small text-rust">404</p>
      <h1 className="mt-4">
        Nothing <span className="text-rust">here.</span>
      </h1>
      <p className="lead mt-8 max-w-[38ch] text-silver">
        This page doesn&rsquo;t exist or has moved. Old event links now live on Unifesto.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-paper">
          Back to home
        </Link>
        <a href={LINKS.whatsOn} target="_blank" rel="noreferrer noopener" className="btn btn-ghost">
          See what&rsquo;s on ↗
        </a>
      </div>
    </section>
  );
}
