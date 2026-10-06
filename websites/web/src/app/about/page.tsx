import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MarqueeBar from "@/components/MarqueeBar";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { PROOF } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "About Unifesto",
  description: `Unifesto is built in Hyderabad by people who ran college events on forms, spreadsheets and group chats. It started at ${PROOF.firstCampus} and now hosts ${PROOF.spacesLive} Spaces.`,
  alternates: { canonical: "/about" },
}, { title: "About Unifesto", description: "Built in Hyderabad by people who ran the events." });

/* What running an event looked like, and what replaced it. The two
   columns are the page's picture: the old way struck through. */
const BEFORE_AFTER = [
  ["Announced across a dozen WhatsApp groups", "One public event page and a feed in the app"],
  ["Registrations in a Google Form", "Tickets, questions and payments in one flow"],
  ["A spreadsheet of names at the gate", "QR passes scanned by Crew at every check-in point"],
  ["Payments chased over UPI screenshots", "Razorpay checkout and payouts that reconcile"],
  ["Certificates made one by one in Canva", "A template, one batch, a link anyone can verify"],
] as const;

const HOLD_TO = [
  {
    title: "Say only what it does.",
    body: "Every feature on this site is shipped. No invented AI, no demo-only screens. If it is not in the product, it is not on the page.",
  },
  {
    title: "The phone does the work.",
    body: "Attendees register and walk in with their phones. Crew scan with theirs. Organisers can run an event from the app when they are nowhere near a laptop.",
  },
  {
    title: "Money is exact.",
    body: "Every rupee collected, refunded and paid out is accounted for, per event and per Space. Refunds need approval before money moves.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])} />
      <Navbar />

      <PageHero
        lines={["Built by people", "who ran the events."]}
        accentFrom={1}
        lede={`Unifesto started in Hyderabad, at ${PROOF.firstCampus}, with a team that had run fests and hackathons on forms, spreadsheets and group chats. We built the tool we wanted then, and opened it to every club, community and institution.`}
        actions={
          <>
            <Link href="/organisers" className="btn btn-lg btn-primary">
              See the platform
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/careers" className="btn btn-lg btn-secondary">
              Work with us
            </Link>
          </>
        }
      />

      <Section surface="paper" aria-labelledby="before-heading">
        <h2 id="before-heading" data-reveal="clip" className="max-w-3xl font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-ink [text-wrap:balance]">
          What running an event used to take.
        </h2>
        <dl data-stagger="rise" className="mt-12">
          {BEFORE_AFTER.map(([before, after]) => (
            <div key={before} className="grid gap-2 py-5 shadow-[inset_0_1px_0_rgb(var(--glow)/0.1)] sm:grid-cols-2 sm:gap-10">
              <dt className="text-[15px] text-ink/45 line-through decoration-ink/30">{before}</dt>
              <dd className="text-[15px] text-ink">{after}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section aria-labelledby="hold-heading">
        <h2 id="hold-heading" data-reveal="clip" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.15] text-paper">
          What we hold to.
        </h2>
        <div data-stagger="rise" className="mt-12 grid gap-10 md:grid-cols-3">
          {HOLD_TO.map((h) => (
            <div key={h.title} className="pt-5 shadow-[inset_0_1px_0_rgb(var(--glow)/0.14)]">
              <h3 className="text-lg text-paper">{h.title}</h3>
              <p className="mt-3 max-w-[40ch] text-[15px] font-light leading-relaxed text-paper/65">{h.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section surface="paper" pad="tight" width="mid" innerClassName="text-center">
        <p data-reveal="blur" className="mx-auto max-w-[44ch] font-display text-[clamp(1.1rem,2.2vw,1.6rem)] leading-[1.4] text-ink [text-wrap:balance]">
          As of {PROOF.asOf}: {PROOF.attendees} people checked in, {PROOF.events} events, {PROOF.spacesLive} Spaces.
        </p>
      </Section>
      <MarqueeBar />
      <Footer />
    </main>
  );
}
