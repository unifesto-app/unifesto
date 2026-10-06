import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import RequestSpaceClient from "./RequestSpaceClient";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/request-space" },
  title: "Request a Space",
  description:
    "Run your club, community or institution on Unifesto. Request a Space and our team will review it.",
}, { title: "Request a Space on Unifesto", description: "Run your club, community or institution on Unifesto." });

export default function RequestSpacePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <PageHero
        lines={["Request a Space."]}
        size="md"
        lede="A Space is home for your club, community or institution: your team, your events and your money in one place. Tell us about it and we'll review your request, usually within 24–48 hours."
      />
      <section className="px-5 pb-24 pt-14 sm:px-8 md:pt-20">
        <div className="mx-auto max-w-2xl rounded-3xl bg-night-2 p-7 sm:p-10" data-reveal="rise">
          <RequestSpaceClient />
        </div>
      </section>
      <Footer />
    </main>
  );
}
