import type { Metadata } from "next";
import Link from "next/link";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { OrbitIdCard } from "@/components/visuals/Orbit";
import RequestSpaceClient from "../../request-space/RequestSpaceClient";

export const metadata: Metadata = withSocial({
  title: "Apply to be an Orbit Lead",
  description:
    "Apply to lead Unifesto Orbit on your campus. Tell us your campus and its clubs, verify your email and phone, and our Program Lead gets back to you.",
  alternates: { canonical: "/orbit/apply" },
}, { title: "Apply to be an Orbit Lead", description: "Lead Unifesto Orbit on your campus." });

/* What happens after Apply, in order. */
const NEXT = [
  { title: "We read it", body: "Our Program Lead reviews every application, usually within a week." },
  { title: "A short call", body: "15 minutes about your campus, its clubs and how you would start." },
  { title: "You are appointed", body: "You get admin access to your campus Space on Unifesto." },
  { title: "Accept the terms", body: "The Orbit Lead Programme Terms appear in the app. Accept them to begin." },
  { title: "Your first 30 days", body: "Onboard 2 clubs to pass your start period. After that, no end date." },
];

export default function OrbitApplyPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Unifesto Orbit", path: "/orbit" },
          { name: "Apply", path: "/orbit/apply" },
        ])}
      />
      <Navbar />
      <PageHero
        lines={["Lead your campus.", "Apply to Orbit."]}
        accentFrom={1}
        size="md"
        lede="One Orbit Lead per campus. You represent Unifesto, not your college, and help every club on campus run its events here. Rewards are recognition, not cash."
      />
      <section className="px-5 pb-24 pt-14 sm:px-8 md:pt-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
          <div className="min-w-0 rounded-3xl bg-night-2 p-7 sm:p-10" data-reveal="rise">
            <RequestSpaceClient kind="orbit" />
          </div>

          <aside className="min-w-0 space-y-10 lg:sticky lg:top-28">
            <div className="flex justify-center lg:justify-start" data-reveal="rise">
              <OrbitIdCard />
            </div>
            <div>
              <h2 className="font-display text-xl text-paper">What happens next</h2>
              {/* The route of a Lead's first weeks: stops on a dotted orbit path. */}
              <ol className="relative mt-6 space-y-6 border-l border-dashed border-paper/20 pl-6">
                {NEXT.map((s, i) => (
                  <li key={s.title} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[33px] top-0.5 grid h-4 w-4 place-items-center rounded-full bg-night-2 ring-1 ring-paper/30"
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-primary" : "bg-paper/40"}`} />
                    </span>
                    <p className="text-sm font-semibold text-paper">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-paper/65">{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
            <p className="text-sm text-paper/60">
              Read the <Link href="/orbit/terms" className="underline underline-offset-4 hover:text-white">programme terms</Link>{" "}
              or go back to <Link href="/orbit" className="underline underline-offset-4 hover:text-white">how Orbit works</Link>.
              Questions: orbit@unifesto.app
            </p>
          </aside>
        </div>
      </section>
      <Footer />
    </main>
  );
}
