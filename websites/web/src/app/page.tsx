import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import MarqueeBar from "@/components/MarqueeBar";
import PlatformShowcase from "@/components/PlatformShowcase";
import EventsGrid from "@/components/EventsGrid";
import HowItWorksSection from "@/components/HowItWorksSection";
import OrganizerPitchSection from "@/components/OrganizerPitchSection";
import SocialProofSection from "@/components/SocialProofSection";
import FinalCTASection from "@/components/FinalCTASection";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Unifesto - The Operating System for Running Events in India",
  description:
    "Unifesto runs the whole event, not just the ticket page. Spaces for your team with role-based access, RSVP and paid ticketing, multi-point QR check-in, Razorpay payouts, cash-accurate financials, certificates, hackathon leaderboards and sponsor leads. 10,000+ attendees across 25+ events. Built by organisers who lived the chaos.",
  keywords: [
    "event management platform India",
    "college fest management software",
    "QR check-in events",
    "event ticketing India",
    "hackathon leaderboard platform",
    "community event platform",
    "event payouts Razorpay",
    "student club event software",
    "event certificates platform",
  ],
  openGraph: {
    title: "Unifesto - Run the whole event, not just the ticket page",
    description:
      "One Space for your team: role-based access, ticketing, multi-point QR check-in, payouts, financials, certificates, leaderboards and sponsor leads. Built for clubs, communities, institutions and startups. 10K+ attendees, 25+ events.",
    type: "website",
    url: "https://www.unifesto.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Unifesto - The event operating system",
    description:
      "Team, tickets, the door, the money and the debrief, in one Space. Multi-point QR check-in, Razorpay payouts, certificates, leaderboards. 10K+ attendees. Built by organisers who lived the chaos.",
  },
  alternates: {
    canonical: "/",
  },
};

export default function Home() {
  return (
    <main className="min-h-[100dvh] bg-canvas overflow-x-hidden">
      <Navbar />
      <Hero />
      <MarqueeBar />
      <PlatformShowcase />
      <HowItWorksSection />
      <EventsGrid />
      <OrganizerPitchSection />
      <SocialProofSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}
