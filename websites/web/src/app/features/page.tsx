import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FeaturesContent from "@/components/features/FeaturesContent";

export const metadata: Metadata = {
  title: "Platform Features | Unifesto",
  description:
    "Discover Unifesto's core platform features: Event Discovery, Forge organiser tools, Gate check-in, Ticketing & RSVP, and Analytics. Everything you need to run an event.",
  keywords: [
    "event discovery",
    "forge organiser dashboard",
    "gate check-in",
    "ticketing system",
    "event analytics",
    "event management features",
    "rsvp management",
  ],
  openGraph: {
    title: "Platform Features | Unifesto",
    description:
      "Discover Unifesto's core platform features for seamless event management.",
    type: "website",
    url: "https://www.unifesto.app/features",
    siteName: "Unifesto",
  },
  twitter: {
    card: "summary_large_image",
    title: "Platform Features | Unifesto",
    description:
      "Discover Unifesto's core platform features for seamless event management.",
    site: "@unifestoapp",
  },
  alternates: {
    canonical: "/features",
  },
};

export default function FeaturesPage() {
  return (
    <main className="min-h-[100dvh] bg-canvas overflow-x-hidden">
      <Navbar />
      <FeaturesContent />
      <Footer />
    </main>
  );
}
