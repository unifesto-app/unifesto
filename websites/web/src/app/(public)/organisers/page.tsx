import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@unifesto/unicon/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FinalCTASection from "@/components/FinalCTASection";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import { ShadeFrame } from "@/components/site/ShadeCard";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { PILLAR_SHADES, PILLAR_VISUALS, ScanVisual } from "@/components/visuals/Product";
import { RubricVisual } from "@/components/visuals/Hackathon";
import { FAQ_ORGANISERS, PILLARS, PLANS, SITE } from "@/lib/site";

export const dynamic = "force-static"; // prerendered, CDN-cacheable: lib/cached-pages.ts

export const metadata: Metadata = withSocial({
  title: "For organisers: ticketing, check-in, payouts and more",
  description:
    "Everything a club, community or institution needs to run events: a Space for your team, paid and free tickets, multi-point QR check-in, Razorpay payouts, WhatsApp and email, certificates, sponsors and stays.",
  alternates: { canonical: "/organisers" },
}, { title: "Unifesto for organisers", description: "Run every event from one Space: tickets, check-in, money, reach and the debrief." });

const STEPS = [
  { title: "Start a Space", body: "Name your club, community or institution. It goes live at once, marked Unverified until we confirm who runs it." },
  { title: "Bring your team", body: "Add Curators to build events and Crew to scan passes. Everyone sees only what their role needs." },
  { title: "Publish and share", body: "Create the event, set tickets and questions, publish, and share a tracked link." },
];

const appLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Unifesto for organisers",
  url: `${SITE.url}/organisers`,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  description: SITE.description,
  // No plan has a monthly price (Z2): General is the one free-to-start offer.
  offers: PLANS.filter((p) => p.id === "starter").map((p) => ({
    "@type": "Offer",
    name: p.name,
    price: 0,
    priceCurrency: "INR",
  })),
};

export default function OrganisersPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={[appLd, breadcrumbLd([{ name: "Home", path: "/" }, { name: "Organisers", path: "/organisers" }])]} />
      <Navbar />

      <PageHero
        lines={["Run every event", "from one Space."]}
        accentFrom={1}
        lede="Tickets, the door, the money, the follow-up and the people doing all of it. Built by organisers who ran college fests on forms and spreadsheets, and wanted better."
        actions={
          <>
            <Link href="/request-space" className="btn btn-lg btn-primary">
              Start a Space
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/pricing" className="btn btn-lg btn-secondary">
              See pricing
            </Link>
          </>
        }
        card={<ScanVisual />}
      />

      {/* In-page index: quick jumps for people, sitelinks for search. */}
      <nav aria-label="On this page" className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* K11: chips that scroll sideways on phones, instead of wrapping into grey text. */}
        <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-4 pt-10 [scrollbar-width:none] sm:mx-0 sm:px-0 md:flex-wrap md:pt-14">
          {PILLARS.map((p) => (
            <li key={p.id} className="shrink-0">
              <a
                href={`#${p.id}`}
                className="inline-block whitespace-nowrap rounded-lg bg-night-2 px-3.5 py-1.5 text-sm text-paper/80 transition-colors duration-150 hover:bg-night-3 hover:text-paper"
              >
                {p.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Section pad="tight">
        {PILLARS.map((p, i) => {
          const Visual = PILLAR_VISUALS[p.id];
          return (
            <FeatureRow
              key={p.id}
              as="h2"
              id={p.id}
              title={p.title}
              lede={p.lede}
              points={p.points}
              visual={
                <ShadeFrame shade={PILLAR_SHADES[p.id]} phone={p.id === "spaces"}>
                  <Visual />
                </ShadeFrame>
              }
              flip={i % 2 === 1}
            >
              {p.id === "after" && (
                <Link href="/stay" className="link-draw mt-6 inline-flex items-center gap-2 text-sm text-paper">
                  More on Unifesto Stay <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
              )}
            </FeatureRow>
          );
        })}
      </Section>

      <Section surface="paper" aria-labelledby="hack-heading">
        <FeatureRow
          as="h2"
          id="hack-heading"
          title="Running a hackathon?"
          lede="Teams and statements, rounds with weighted rubrics, judge panels scoring from their phones, a help desk and a live leaderboard. It is all part of the same Space."
          visual={
            <ShadeFrame shade="blue">
              <RubricVisual />
            </ShadeFrame>
          }
        >
          <Link href="/sprint" className="link-draw mt-6 inline-flex items-center gap-2 text-sm text-paper">
            More on Unifesto Sprint <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Link>
        </FeatureRow>
      </Section>

      <Section aria-labelledby="start-heading">
        <h2 id="start-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-paper">
          Start in three steps.
        </h2>
        <ol data-stagger="rise" className="mt-12 grid gap-10 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="pt-5 border-t border-border">
              <span className="font-display tabular text-sm text-paper/45">{i + 1}</span>
              <h3 className="mt-3 text-lg text-paper">{s.title}</h3>
              <p className="mt-2 max-w-[38ch] text-[15px] font-light leading-relaxed text-paper/65">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-sm text-paper/60">
          Already approved? Open the console at{" "}
          <Link href="/console" className="link-draw text-paper">unifesto.app/console</Link> or manage events from the Unifesto app.
        </p>
      </Section>

      <FaqList faqs={FAQ_ORGANISERS} />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
