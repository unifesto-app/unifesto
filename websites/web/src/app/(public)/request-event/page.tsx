import type { Metadata } from "next";
import { withSocial } from "@/lib/seo";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PageHero from "@/components/site/PageHero";
import RequestSpaceClient from "../request-space/RequestSpaceClient";

export const metadata: Metadata = withSocial({
  alternates: { canonical: "/request-event" },
  title: "Host an event",
  description: "Host one event on Unifesto without setting up a Space. Tell us about it and our team will review it.",
}, { title: "Host an event on Unifesto", description: "Host one event on Unifesto without setting up a Space." });

export default function RequestEventPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-canvas">
      <Navbar />
      <PageHero
        lines={["Host an event."]}
        size="md"
        lede="No Space yet? Tell us about your event. Once we approve it, we set up a Space for you with the event inside as a draft, ready for tickets."
      />
      <section className="px-5 pb-24 pt-14 sm:px-8 md:pt-20">
        <div className="mx-auto max-w-2xl rounded-3xl bg-night-2 p-7 sm:p-10" data-reveal="rise">
          <RequestSpaceClient kind="event" />
        </div>
      </section>
      <Footer />
    </main>
  );
}
