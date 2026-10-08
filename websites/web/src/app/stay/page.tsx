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
import JsonLd, { breadcrumbLd } from "@/components/site/JsonLd";
import { StaySetupVisual, StayRequestsVisual, StayPassScreen, StayScanVisual } from "@/components/visuals/Stay";
import { FAQ_STAY, STAY_STEPS } from "@/lib/site";

export const metadata: Metadata = withSocial({
  title: "Unifesto Stay: accommodation booking for events",
  description:
    "Give outstation attendees a place to stay. List hostels, hotels or homestays for your event, approve room requests with photo ID, take payment online or at the property, and check guests in with a Stay Pass.",
  alternates: { canonical: "/stay" },
}, { title: "Unifesto Stay", description: "Rooms for your event's guests: requests, approvals, payment and a Stay Pass at arrival." });

export default function StayPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Unifesto Stay", path: "/stay" }])} />
      <Navbar />

      <PageHero
        lines={["A bed for everyone", "who travels in."]}
        accentFrom={1}
        lede="Unifesto Stay puts accommodation inside your event. List the rooms, approve who gets them, collect payment if you charge, and check guests in with a pass on their phone. No spreadsheet of names at the hostel gate."
        actions={
          <>
            <Link href="/request-space" className="btn btn-lg btn-primary">
              Add stays to your event
              <ArrowRight className="btn-arrow h-3.5 w-3.5" weight="bold" aria-hidden="true" />
            </Link>
            <Link href="/app" className="btn btn-lg btn-secondary">
              Book from the app
            </Link>
          </>
        }
        aside={<StayPassScreen />}
      />

      <Section pad="tight">
        <FeatureRow
          as="h2"
          id="setup"
          title="List the rooms once"
          lede="Add one or more stays to an event: a hostel block, a partner hotel, a homestay. Each gets photos, amenities, house rules, a contact, check-in times and the dates it can be booked."
          points={[
            "Room options with bed counts, for anyone, men only or women only",
            "Priced per night or per stay, or free",
            "Paid online through Razorpay, at the property, or not at all",
            "Your own booking questions, and a group size limit per request",
          ]}
          visual={<StaySetupVisual />}
        />
        <FeatureRow
          as="h2"
          id="approvals"
          title="You decide who gets a bed"
          lede="Requests come from registered attendees only, with a photo ID for every guest. Your team approves or rejects each one and assigns the room. Beds are held only after approval, and unpaid online bookings release their beds when the payment window closes."
          points={[
            "Photo ID per guest, kept private to your team",
            "Room or bed allocation and staff-only notes",
            "Payment window for online stays, 48 hours by default",
            "One open booking per person per event",
          ]}
          visual={<StayRequestsVisual />}
          flip
        />
        <FeatureRow
          as="h2"
          id="arrival"
          title="Arrival takes one scan"
          lede="Approved guests carry a Stay Pass in the Unifesto app. Your team scans it at the property to check them in, and again at check-out, so you always know who is in the building."
          points={["Scan Stay Pass from the organiser app", "Check-in and check-out per booking", "Live count of guests checked in"]}
          visual={<StayScanVisual />}
        />
      </Section>

      <Section surface="paper" aria-labelledby="flow-heading">
        <h2 id="flow-heading" data-reveal="clip" className="font-display text-[clamp(1.6rem,3.2vw,2.4rem)] leading-[1.12] text-ink">
          How a guest books.
        </h2>
        <ol data-stagger="rise" className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
          {STAY_STEPS.map((s, i) => (
            <li key={s.title} className="pt-5 shadow-[inset_0_1px_0_rgb(var(--glow)/0.14)]">
              <span className="font-display tabular text-sm text-ink/45">{i + 1}</span>
              <h3 className="mt-3 text-base text-ink">{s.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-ink/60">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <FaqList faqs={FAQ_STAY} />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
