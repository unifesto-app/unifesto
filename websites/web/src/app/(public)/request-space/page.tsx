import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import RequestSpaceClient from "./RequestSpaceClient";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/request-space" },
  title: "Start a Space",
  description:
    "Run your club, community or institution on Unifesto. Start a Space and it goes live at once.",
}, { title: "Start a Space on Unifesto", description: "Run your club, community or institution on Unifesto." });

export default function RequestSpacePage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <PageHero
        lines={["Start a Space."]}
        size="md"
        lede="A Space is home for your club, community or institution: your team, your events and your money in one place. It goes live as soon as you create it, marked Unverified until we confirm who runs it."
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
