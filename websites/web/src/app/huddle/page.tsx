import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FinalCTASection from "@/components/FinalCTASection";
import PageHero from "@/components/site/PageHero";
import Section from "@/components/site/Section";
import FeatureRow from "@/components/site/FeatureRow";
import FaqList from "@/components/site/FaqList";
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { HuddleSetupVisual, HuddleHostVisual, HuddleRoomScreen, HuddleJoinVisual } from "@/components/visuals/Huddle";
import { FAQ_HUDDLE, HUDDLE_STEPS } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "Unifesto Huddle: online sessions for communities",
  description:
    "Run talks, workshops and AMAs online from your Space. Free or paid registration, a video room inside Unifesto with no link to forward, reminders, co-hosts and recordings.",
  alternates: { canonical: "/huddle" },
}, { title: "Unifesto Huddle", description: "Online sessions for your Space: registration, payment, an in-app room and recordings." });

export default function HuddlePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Unifesto Huddle", path: "/huddle" }])} />
      <Navbar />

      <PageHero
        lines={["Your community,", "online in one tap."]}
        accentFrom={1}
        lede="Unifesto Huddle runs your online sessions next to your events. Schedule a talk or a workshop, take registrations or payments, and meet everyone in a video room inside Unifesto. No meeting links passed around a WhatsApp group."
        actions={
          <>
            <Link href="/request-space" className="btn btn-lg btn-primary">
              Host a huddle
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/app" className="btn btn-lg btn-secondary">
              Join from the app
            </Link>
          </>
        }
        aside={<HuddleRoomScreen />}
      />

      <Section pad="tight">
        <FeatureRow
          as="h2"
          id="setup"
          title="Schedule it in a minute"
          lede="A session belongs to your Space, like your events. Give it a title, a time and a price, and choose where it happens: in Unifesto's own video room, or on Google Meet, Zoom or Teams."
          points={[
            "Free, or one price through Razorpay",
            "Interactive, or broadcast where only hosts speak",
            "Duplicate last week's session for the next one",
            "Draft first, publish when you're ready",
          ]}
          visual={<HuddleSetupVisual />}
        />
        <FeatureRow
          as="h2"
          id="room"
          title="Only the people who registered get in"
          lede="In a Unifesto room there is no URL to share. Each attendee gets their own pass into the room, it expires, and one account can only be in the room once. Joining opens 15 minutes before start, and the moment someone joins counts as attendance."
          points={[
            "Video, audio, screen sharing and chat",
            "Hosts run it from the web, attendees join in the app",
            "Reminders a day before and 15 minutes before",
          ]}
          visual={<HuddleJoinVisual />}
          flip
        />
        <FeatureRow
          as="h2"
          id="host"
          title="Run it with your team"
          lede="Add co-hosts by email, go live, record, and end the session when you're done. If plans change, cancel it and everyone who paid is refunded automatically."
          points={["Co-hosts join as hosts, not attendees", "Recordings saved to the session", "Registrations, payments and attendance in one view"]}
          visual={<HuddleHostVisual />}
        />
      </Section>

      <Section surface="paper" aria-labelledby="flow-heading">
        <h2 id="flow-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-ink">
          How an attendee joins.
        </h2>
        <ol data-stagger="rise" className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {HUDDLE_STEPS.map((s, i) => (
            <li key={s.title} className="pt-5 shadow-[inset_0_1px_0_rgb(var(--glow)/0.14)]">
              <span className="font-display tabular text-sm text-ink/45">{i + 1}</span>
              <h3 className="mt-3 text-base text-ink">{s.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-ink/60">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <FaqList faqs={FAQ_HUDDLE} />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
